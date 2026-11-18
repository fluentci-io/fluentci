//! Asynchronous SQLite metadata queries. Object payloads never enter this database.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use object_store::{ObjectMeta, path::Path};
use sea_query::{Alias, Condition, Expr, OnConflict, Query, SelectStatement, SqliteQueryBuilder};
use sea_query_binder::SqlxBinder;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::{path::Path as FilePath, time::Duration};
use tokio::sync::OnceCell;

#[derive(Debug)]
pub(super) struct Index {
    pool: SqlitePool,
    initialized: OnceCell<()>,
}

#[derive(Debug)]
pub(super) struct Page<'a> {
    pub prefix: &'a str,
    pub search: &'a str,
    pub cursor: &'a str,
    pub limit: usize,
    pub sort: &'a str,
    pub direction: &'a str,
}

#[derive(Serialize, Deserialize)]
struct Cursor {
    key: String,
    size: i64,
    last_modified: String,
    sort: String,
    direction: String,
}

fn cursor(page: &Page<'_>) -> Result<Option<Cursor>, ()> {
    if page.cursor.is_empty() {
        return Ok(None);
    }
    if let Some(value) = page.cursor.strip_prefix("v1.") {
        let cursor: Cursor =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(value).map_err(|_| ())?)
                .map_err(|_| ())?;
        if cursor.sort != page.sort || cursor.direction != page.direction {
            return Err(());
        }
        Ok(Some(cursor))
    } else if page.sort == "key" && page.direction == "asc" {
        Ok(Some(Cursor {
            key: page.cursor.into(),
            size: 0,
            last_modified: String::new(),
            sort: "key".into(),
            direction: "asc".into(),
        }))
    } else {
        Err(())
    }
}

pub(super) fn valid_page(page: &Page<'_>) -> bool {
    matches!(page.sort, "key" | "size" | "lastModified")
        && matches!(page.direction, "asc" | "desc")
        && cursor(page).is_ok()
}

fn name(value: &str) -> Alias {
    Alias::new(value)
}

fn database_error(error: sqlx::Error) -> object_store::Error {
    object_store::Error::Generic {
        store: "cache metadata index",
        source: Box::new(error),
    }
}

fn scoped(path: &Path) -> Option<(&str, &str)> {
    path.as_ref().strip_prefix("accounts/")?.split_once('/')
}

fn protocol(key: &str) -> &str {
    let mut parts = key.split('/');
    match parts.next().unwrap_or("other") {
        "_artifacts" => parts.next().unwrap_or("other"),
        "oci" => "buildkit",
        value => value,
    }
}

fn insert(path: &Path, meta: &ObjectMeta) -> Option<sea_query::InsertStatement> {
    let (account, key) = scoped(path)?;
    let mut query = Query::insert();
    query
        .into_table(name("cache_keys"))
        .columns(["account", "key", "protocol", "size", "last_modified"].map(name))
        .values_panic([
            account.into(),
            key.into(),
            protocol(key).into(),
            meta.size.into(),
            meta.last_modified.to_rfc3339().into(),
        ])
        .on_conflict(
            OnConflict::columns([name("account"), name("key")])
                .update_columns([name("protocol"), name("size"), name("last_modified")])
                .to_owned(),
        );
    Some(query)
}

fn filters(account: &str, prefix: &str, search: &str) -> Condition {
    let mut condition = Condition::all().add(Expr::col(name("account")).eq(account));
    if !prefix.is_empty() {
        condition = condition
            .add(Expr::col(name("key")).gte(prefix))
            .add(Expr::col(name("key")).lt(format!("{prefix}\u{10ffff}")));
    }
    if search.chars().count() >= 3 {
        let phrase = format!("\"{}\"", search.replace('"', "\"\""));
        condition = condition.add(Expr::cust_with_values(
            "rowid IN (SELECT rowid FROM cache_keys_fts WHERE cache_keys_fts MATCH ?)",
            [phrase],
        ));
    } else if !search.is_empty() {
        condition = condition.add(Expr::cust_with_values(
            "instr(lower(key), lower(?)) > 0",
            [search],
        ));
    }
    condition
}

impl Index {
    pub(super) fn new(file: Option<&FilePath>) -> anyhow::Result<Self> {
        let mut options = SqliteConnectOptions::new()
            .create_if_missing(true)
            .busy_timeout(Duration::from_secs(5));
        if let Some(file) = file {
            if let Some(parent) = file.parent().filter(|path| !path.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)?;
            }
            options = options.filename(file).journal_mode(SqliteJournalMode::Wal);
        } else {
            options = options.in_memory(true);
        }
        Ok(Self {
            pool: SqlitePoolOptions::new()
                .max_connections(1)
                .connect_lazy_with(options),
            initialized: OnceCell::new(),
        })
    }

    async fn initialize(&self) -> Result<(), sqlx::Error> {
        self.initialized
            .get_or_try_init(|| async {
                sqlx::raw_sql(include_str!("catalog.sql"))
                    .execute(&self.pool)
                    .await?;
                Ok::<(), sqlx::Error>(())
            })
            .await?;
        Ok(())
    }

    pub(super) async fn ready(&self) -> object_store::Result<bool> {
        self.initialize().await.map_err(database_error)?;
        let (sql, values) = Query::select()
            .column(name("ready"))
            .from(name("cache_index_state"))
            .and_where(Expr::col(name("id")).eq(1))
            .build_sqlx(SqliteQueryBuilder);
        let row = sqlx::query_with(&sql, values)
            .fetch_optional(&self.pool)
            .await
            .map_err(database_error)?;
        Ok(row.is_some_and(|row| row.get::<i64, _>("ready") == 1))
    }

    pub(super) async fn change(
        &self,
        path: &Path,
        meta: Option<&ObjectMeta>,
    ) -> object_store::Result<()> {
        self.initialize().await.map_err(database_error)?;
        let Some((account, key)) = scoped(path) else {
            return Ok(());
        };
        let (sql, values) = if let Some(meta) = meta {
            insert(path, meta)
                .expect("scoped path")
                .build_sqlx(SqliteQueryBuilder)
        } else {
            Query::delete()
                .from_table(name("cache_keys"))
                .and_where(Expr::col(name("account")).eq(account))
                .and_where(Expr::col(name("key")).eq(key))
                .build_sqlx(SqliteQueryBuilder)
        };
        sqlx::query_with(&sql, values)
            .execute(&self.pool)
            .await
            .map_err(database_error)?;
        Ok(())
    }

    pub(super) async fn replace(&self, objects: Vec<ObjectMeta>) -> object_store::Result<()> {
        self.initialize().await.map_err(database_error)?;
        let result = async {
            let mut transaction = self.pool.begin().await?;
            let generation = chrono::Utc::now().timestamp_micros();
            for chunk in objects.chunks(400) {
                let mut query = Query::insert();
                query.into_table(name("cache_keys")).columns(
                    [
                        "account",
                        "key",
                        "protocol",
                        "size",
                        "last_modified",
                        "generation",
                    ]
                    .map(name),
                );
                for meta in chunk {
                    if let Some((account, key)) = scoped(&meta.location) {
                        query.values_panic([
                            account.into(),
                            key.into(),
                            protocol(key).into(),
                            meta.size.into(),
                            meta.last_modified.to_rfc3339().into(),
                            generation.into(),
                        ]);
                    }
                }
                query.on_conflict(
                    OnConflict::columns([name("account"), name("key")])
                        .update_columns([
                            name("protocol"),
                            name("size"),
                            name("last_modified"),
                            name("generation"),
                        ])
                        .to_owned(),
                );
                let (sql, values) = query.build_sqlx(SqliteQueryBuilder);
                sqlx::query_with(&sql, values)
                    .execute(&mut *transaction)
                    .await?;
            }
            let (sql, values) = Query::delete()
                .from_table(name("cache_keys"))
                .and_where(Expr::col(name("generation")).ne(generation))
                .build_sqlx(SqliteQueryBuilder);
            sqlx::query_with(&sql, values)
                .execute(&mut *transaction)
                .await?;
            let (sql, values) = Query::insert()
                .into_table(name("cache_index_state"))
                .columns([name("id"), name("ready")])
                .values_panic([1.into(), 1.into()])
                .on_conflict(
                    OnConflict::column(name("id"))
                        .update_column(name("ready"))
                        .to_owned(),
                )
                .build_sqlx(SqliteQueryBuilder);
            sqlx::query_with(&sql, values)
                .execute(&mut *transaction)
                .await?;
            transaction.commit().await
        }
        .await;
        result.map_err(database_error)
    }

    pub(super) async fn page(
        &self,
        account: &str,
        input: &Page<'_>,
    ) -> object_store::Result<Value> {
        let Page {
            prefix,
            search,
            cursor: _,
            limit,
            sort,
            direction,
        } = *input;
        let result = async {
            let mut transaction = self.pool.begin().await?;
            let mut page = Query::select();
            let column = match sort { "size" => "size", "lastModified" => "last_modified", _ => "key" };
            let order = if direction == "desc" { sea_query::Order::Desc } else { sea_query::Order::Asc };
            page.columns(["key", "size", "last_modified"].map(name)).from(name("cache_keys"))
                .cond_where(filters(account, prefix, search))
                .order_by(name(column), order.clone()).order_by(name("key"), order).limit((limit + 1) as u64);
            if let Some(after) = cursor(input).map_err(|_| sqlx::Error::Protocol("Invalid pagination cursor".into()))? {
                let value: sea_query::Value = match sort { "size" => after.size.into(), "lastModified" => after.last_modified.into(), _ => after.key.clone().into() };
                let comparison = if direction == "desc" { Expr::col(name(column)).lt(value.clone()) } else { Expr::col(name(column)).gt(value.clone()) };
                let tie = if direction == "desc" { Expr::col(name("key")).lt(after.key) } else { Expr::col(name("key")).gt(after.key) };
                page.cond_where(Condition::any().add(comparison).add(Condition::all().add(Expr::col(name(column)).eq(value)).add(tie)));
            }
            let (sql, values) = page.build_sqlx(SqliteQueryBuilder);
            let rows = sqlx::query_with(&sql, values).fetch_all(&mut *transaction).await?;
            let keys: Vec<Value> = rows.iter().take(limit).map(|row| json!({"key": row.get::<String, _>("key"), "size": row.get::<i64, _>("size"), "lastModified": row.get::<String, _>("last_modified")})).collect();
            let cursor = if rows.len() > limit {
                rows.get(limit - 1).map(|row| {
                    let key = row.get::<String, _>("key");
                    if sort == "key" && direction == "asc" { json!(key) } else {
                        let cursor = Cursor { key, size: row.get("size"), last_modified: row.get("last_modified"), sort: sort.into(), direction: direction.into() };
                        json!(format!("v1.{}", URL_SAFE_NO_PAD.encode(serde_json::to_vec(&cursor).expect("serializable cursor"))))
                    }
                })
            } else { None };
            let mut count: SelectStatement = Query::select();
            count.expr_as(Expr::col(name("key")).count(), name("count")).from(name("cache_keys")).cond_where(filters(account, prefix, search));
            let (sql, values) = count.build_sqlx(SqliteQueryBuilder);
            let matched: i64 = sqlx::query_with(&sql, values).fetch_one(&mut *transaction).await?.get("count");
            let (sql, values) = Query::select().column(name("protocol"))
                .expr_as(Expr::col(name("size")).sum(), name("bytes"))
                .expr_as(Expr::col(name("key")).count(), name("key_count"))
                .from(name("cache_keys")).and_where(Expr::col(name("account")).eq(account))
                .group_by_col(name("protocol")).order_by(name("protocol"), sea_query::Order::Asc).build_sqlx(SqliteQueryBuilder);
            let rows = sqlx::query_with(&sql, values).fetch_all(&mut *transaction).await?;
            let protocols: Vec<Value> = rows.iter().map(|row| json!({"protocol": row.get::<String, _>("protocol"), "bytes": row.get::<i64, _>("bytes"), "keyCount": row.get::<i64, _>("key_count")})).collect();
            let total_bytes: i64 = rows.iter().map(|row| row.get::<i64, _>("bytes")).sum();
            let total_keys: i64 = rows.iter().map(|row| row.get::<i64, _>("key_count")).sum();
            transaction.commit().await?;
            Ok::<_, sqlx::Error>(json!({"keys":keys,"cursor":cursor,"matchedKeys":matched,"totalBytes":total_bytes,"totalKeys":total_keys,"protocols":protocols}))
        }.await;
        result.map_err(database_error)
    }
}
