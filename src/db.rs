use crate::models::*;
use anyhow::{Context, Result};
use sea_query::{
    Asterisk, Cond, Expr, ExprTrait, Func, JoinType, OnConflict, Order, Query, SelectStatement,
    SqliteQueryBuilder, UnionType,
};
use sea_query_sqlx::SqlxBinder;
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::{path::Path, time::Duration};

#[derive(Clone)]
pub struct Db(SqlitePool);

impl Db {
    pub async fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            tokio::fs::create_dir_all(parent).await?;
        }

        #[cfg(unix)]
        {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .mode(0o600)
                .open(path)?;
        }
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(10));
        let db = Self(
            SqlitePoolOptions::new()
                .max_connections(5)
                .connect_with(options)
                .await?,
        );
        sqlx::migrate!()
            .run(&db.0)
            .await
            .context("SQLite migrations failed")?;
        Ok(db)
    }

    pub async fn project(&self, key: &str) -> Result<Option<Project>> {
        let (sql, values) = Query::select()
            .column("data")
            .from("projects")
            .cond_where(
                Cond::any()
                    .add(Expr::col("id").eq(key))
                    .add(Expr::col("name").eq(key))
                    .add(Expr::col("path").eq(key)),
            )
            .order_by("created_at", Order::Asc)
            .limit(1)
            .build_sqlx(SqliteQueryBuilder);
        let data: Option<String> = sqlx::query_scalar_with(&sql, values)
            .fetch_optional(&self.0)
            .await?;
        data.map(|data| serde_json::from_str(&data).map_err(Into::into))
            .transpose()
    }

    pub async fn projects(&self) -> Result<Vec<Project>> {
        let (sql, values) = Query::select()
            .column("data")
            .from("projects")
            .order_by("created_at", Order::Asc)
            .order_by("id", Order::Asc)
            .build_sqlx(SqliteQueryBuilder);
        let rows: Vec<String> = sqlx::query_scalar_with(&sql, values)
            .fetch_all(&self.0)
            .await?;
        rows.into_iter()
            .map(|row| Ok(serde_json::from_str(&row)?))
            .collect()
    }

    pub async fn save_project(&self, project: &Project) -> Result<()> {
        let (sql, values) = Query::insert()
            .into_table("projects")
            .columns(["id", "name", "path", "created_at", "data"])
            .values([
                project.id.clone().into(),
                project.name.clone().into(),
                project.path.clone().into(),
                project.created_at.clone().into(),
                serde_json::to_string(project)?.into(),
            ])?
            .on_conflict(
                OnConflict::column("id")
                    .update_columns(["name", "path", "data"])
                    .to_owned(),
            )
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&sql, values).execute(&self.0).await?;
        Ok(())
    }

    /// Update only statistics, preserving metadata edited while a run was active.
    pub async fn save_project_stats(&self, project: &Project) -> Result<()> {
        let data = Func::cust("json_set").args([
            Expr::col("data"),
            Expr::val("$.speed"),
            Expr::val(project.speed),
            Expr::val("$.reliability"),
            Expr::val(project.reliability),
            Expr::val("$.buildsPerWeek"),
            Expr::val(project.builds_per_week),
            Expr::val("$.recentRuns"),
            Expr::expr(Func::cust("json").arg(serde_json::to_string(&project.recent_runs)?)),
        ]);
        let (sql, values) = Query::update()
            .table("projects")
            .value("data", data)
            .and_where(Expr::col("id").eq(project.id.clone()))
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&sql, values).execute(&self.0).await?;
        Ok(())
    }

    pub async fn project_name_available(&self, name: &str, project_id: &str) -> Result<bool> {
        let (sql, values) = Query::select()
            .expr(Expr::exists(conflicting_name(name, project_id)))
            .build_sqlx(SqliteQueryBuilder);
        let exists: bool = sqlx::query_scalar_with(&sql, values)
            .fetch_one(&self.0)
            .await?;
        Ok(!exists)
    }

    /// The conditional write checks uniqueness under SQLite's writer lock.
    pub async fn save_project_with_unique_name(&self, project: &Project) -> Result<()> {
        let (sql, values) = Query::update()
            .table("projects")
            .value("name", project.name.clone())
            .value("data", serde_json::to_string(project)?)
            .and_where(Expr::col("id").eq(project.id.clone()))
            .and_where(Expr::not_exists(conflicting_name(
                &project.name,
                &project.id,
            )))
            .build_sqlx(SqliteQueryBuilder);
        let result = sqlx::query_with(&sql, values).execute(&self.0).await?;
        anyhow::ensure!(
            result.rows_affected() == 1,
            "A project with this name already exists."
        );
        Ok(())
    }

    pub async fn delete_project(&self, id: &str) -> Result<bool> {
        let (sql, values) = Query::delete()
            .from_table("projects")
            .and_where(Expr::col("id").eq(id))
            .build_sqlx(SqliteQueryBuilder);
        Ok(sqlx::query_with(&sql, values)
            .execute(&self.0)
            .await?
            .rows_affected()
            > 0)
    }

    pub async fn actions(&self, project: &str) -> Result<Vec<Action>> {
        let (sql, values) = Query::select()
            .column("data")
            .from("actions")
            .and_where(Expr::col("project_id").eq(project))
            .order_by("position", Order::Asc)
            .build_sqlx(SqliteQueryBuilder);
        let rows: Vec<String> = sqlx::query_scalar_with(&sql, values)
            .fetch_all(&self.0)
            .await?;
        rows.into_iter()
            .map(|row| Ok(serde_json::from_str(&row)?))
            .collect()
    }

    pub async fn save_actions(&self, project: &str, actions: &[Action]) -> Result<()> {
        let mut tx = self.0.begin().await?;
        let (sql, values) = Query::delete()
            .from_table("actions")
            .and_where(Expr::col("project_id").eq(project))
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&sql, values).execute(&mut *tx).await?;
        for (position, action) in actions.iter().enumerate() {
            let (sql, values) = Query::insert()
                .into_table("actions")
                .columns(["id", "project_id", "position", "data"])
                .values([
                    action.id.clone().unwrap_or_else(id).into(),
                    project.into(),
                    (position as i64).into(),
                    serde_json::to_string(action)?.into(),
                ])?
                .build_sqlx(SqliteQueryBuilder);
            sqlx::query_with(&sql, values).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn save_run(&self, run: &Run) -> Result<()> {
        let mut tx = self.0.begin().await?;
        let mut metadata = run.clone();
        metadata.jobs.clear();
        let (sql, values) = Query::insert()
            .into_table("runs")
            .columns(["id", "project_id", "date", "status", "data"])
            .values([
                run.id.clone().into(),
                run.project_id.clone().into(),
                run.date.clone().into(),
                run.status.as_deref().unwrap_or("PENDING").into(),
                serde_json::to_string(&metadata)?.into(),
            ])?
            .on_conflict(
                OnConflict::column("id")
                    .update_columns(["status", "data"])
                    .to_owned(),
            )
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&sql, values).execute(&mut *tx).await?;
        for (position, job) in run.jobs.iter().enumerate() {
            let mut job = job.clone();
            job.logs = None;
            let (sql, values) = Query::insert()
                .into_table("jobs")
                .columns(["id", "run_id", "position", "data"])
                .values([
                    job.id.clone().into(),
                    run.id.clone().into(),
                    (position as i64).into(),
                    serde_json::to_string(&job)?.into(),
                ])?
                .on_conflict(OnConflict::column("id").update_column("data").to_owned())
                .build_sqlx(SqliteQueryBuilder);
            sqlx::query_with(&sql, values).execute(&mut *tx).await?;
        }
        for job in &run.jobs {
            for log in job.logs.iter().flatten() {
                let (sql, values) = Query::insert()
                    .into_table("logs")
                    .columns(["id", "job_id", "created_at", "message"])
                    .values([
                        log.id.clone().into(),
                        job.id.clone().into(),
                        log.created_at.clone().into(),
                        log.message.clone().into(),
                    ])?
                    .on_conflict(OnConflict::column("id").do_nothing().to_owned())
                    .build_sqlx(SqliteQueryBuilder);
                sqlx::query_with(&sql, values).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn logs(&self, job: Option<&str>, project: Option<&str>) -> Result<Vec<Log>> {
        let mut query = Query::select();
        query
            .column(("l", Asterisk))
            .from_as("logs", "l")
            .join_as(
                JoinType::InnerJoin,
                "jobs",
                "j",
                Expr::col(("j", "id")).equals(("l", "job_id")),
            )
            .join_as(
                JoinType::InnerJoin,
                "runs",
                "r",
                Expr::col(("r", "id")).equals(("j", "run_id")),
            )
            .order_by(("l", "created_at"), Order::Asc)
            .order_by(("l", "rowid"), Order::Asc);
        if let Some(job) = job {
            query.and_where(Expr::col(("l", "job_id")).eq(job));
        }
        if let Some(project) = project {
            query.and_where(Expr::col(("r", "project_id")).eq(project));
        }
        let (sql, values) = query.build_sqlx(SqliteQueryBuilder);
        let rows = sqlx::query_with(&sql, values).fetch_all(&self.0).await?;
        Ok(rows
            .into_iter()
            .map(|row| Log {
                id: row.get("id"),
                job_id: row.get("job_id"),
                message: row.get("message"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn jobs(&self, run: Option<&str>) -> Result<Vec<Job>> {
        let mut query = Query::select();
        query
            .column("data")
            .from("jobs")
            .order_by("position", Order::Asc)
            .order_by("rowid", Order::Asc);
        if let Some(run) = run {
            query.and_where(Expr::col("run_id").eq(run));
        }
        let (sql, values) = query.build_sqlx(SqliteQueryBuilder);
        let rows: Vec<String> = sqlx::query_scalar_with(&sql, values)
            .fetch_all(&self.0)
            .await?;
        let mut jobs = Vec::new();
        for row in rows {
            let mut job: Job = serde_json::from_str(&row)?;
            job.logs = Some(self.logs(Some(&job.id), None).await?);
            jobs.push(job);
        }
        Ok(jobs)
    }

    pub async fn runs(&self, project: &str) -> Result<Vec<Run>> {
        let (sql, values) = Query::select()
            .column("data")
            .from("runs")
            .and_where(Expr::col("project_id").eq(project))
            .order_by("date", Order::Asc)
            .order_by("id", Order::Asc)
            .build_sqlx(SqliteQueryBuilder);
        let rows: Vec<String> = sqlx::query_scalar_with(&sql, values)
            .fetch_all(&self.0)
            .await?;
        let mut runs = Vec::new();
        for row in rows {
            let mut run: Run = serde_json::from_str(&row)?;
            run.jobs = self.jobs(Some(&run.id)).await?;
            runs.push(run);
        }
        Ok(runs)
    }

    pub async fn run(&self, id: &str) -> Result<Option<Run>> {
        let (sql, values) = Query::select()
            .column("data")
            .from("runs")
            .and_where(Expr::col("id").eq(id))
            .build_sqlx(SqliteQueryBuilder);
        let data: Option<String> = sqlx::query_scalar_with(&sql, values)
            .fetch_optional(&self.0)
            .await?;
        if let Some(data) = data {
            let mut run: Run = serde_json::from_str(&data)?;
            run.jobs = self.jobs(Some(id)).await?;
            Ok(Some(run))
        } else {
            Ok(None)
        }
    }

    pub async fn setting(&self, key: &str) -> Result<Option<String>> {
        let (sql, values) = Query::select()
            .column("value")
            .from("settings")
            .and_where(Expr::col("key").eq(key))
            .build_sqlx(SqliteQueryBuilder);
        Ok(sqlx::query_scalar_with(&sql, values)
            .fetch_optional(&self.0)
            .await?)
    }

    pub async fn search(
        &self,
        text: &str,
        project: Option<&str>,
        limit: i32,
    ) -> Result<Vec<SearchResult>> {
        // Treat user input as literal token prefixes, never as FTS operators.
        let text: String = text.chars().take(256).collect();
        let expression = text
            .split(|c: char| !c.is_alphanumeric())
            .filter(|token| !token.is_empty())
            .take(16)
            .map(|token| format!("\"{token}\"*"))
            .collect::<Vec<_>>()
            .join(" AND ");
        if expression.is_empty() || limit <= 0 {
            return Ok(Vec::new());
        }
        let (sql, values) = search_query(&expression, project, Ord::min(limit, 100) as u64)
            .build_sqlx(SqliteQueryBuilder);
        let rows = sqlx::query_with(&sql, values).fetch_all(&self.0).await?;
        Ok(rows
            .into_iter()
            .map(|row| SearchResult {
                id: row.get("id"),
                kind: row.get("kind"),
                project_id: row.get("project_id"),
                run_id: row.get("run_id"),
                job_id: row.get("job_id"),
                title: row.get("title"),
                excerpt: row.get("excerpt"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let (sql, values) = Query::insert()
            .into_table("settings")
            .columns(["key", "value"])
            .values([key.into(), value.into()])?
            .on_conflict(OnConflict::column("key").update_column("value").to_owned())
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&sql, values).execute(&self.0).await?;
        Ok(())
    }

    pub fn filename(&self) -> std::path::PathBuf {
        self.0.connect_options().get_filename().to_path_buf()
    }

    pub async fn acquire_tangled_sync(&self, did: &str) -> Result<bool> {
        let now = chrono::Utc::now().timestamp_millis();
        let (query, values) = Query::insert()
            .into_table("tangled_sync")
            .columns(["account_did", "started_at", "updated_at"])
            .values([did.into(), now.into(), 0i64.into()])?
            .on_conflict(OnConflict::column("account_did").do_nothing().to_owned())
            .build_sqlx(SqliteQueryBuilder);
        if sqlx::query_with(&query, values)
            .execute(&self.0)
            .await?
            .rows_affected()
            > 0
        {
            return Ok(true);
        }
        let (query, values) = Query::update()
            .table("tangled_sync")
            .value("started_at", now)
            .and_where(Expr::col("account_did").eq(did))
            .and_where(Expr::col("started_at").lt(now - 300_000))
            .and_where(Expr::col("updated_at").lt(now - 900_000))
            .build_sqlx(SqliteQueryBuilder);
        Ok(sqlx::query_with(&query, values)
            .execute(&self.0)
            .await?
            .rows_affected()
            > 0)
    }

    pub async fn fail_tangled_sync(&self, did: &str, error: &str) -> Result<()> {
        let (query, values) = Query::update()
            .table("tangled_sync")
            .value("started_at", 0i64)
            .value("error", error)
            .and_where(Expr::col("account_did").eq(did))
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&query, values).execute(&self.0).await?;
        Ok(())
    }

    pub async fn replace_tangled_repositories(
        &self,
        did: &str,
        repositories: &[crate::tangled::TangledRepository],
    ) -> Result<()> {
        let mut transaction = self.0.begin().await?;
        let (query, values) = Query::delete()
            .from_table("tangled_repositories")
            .and_where(Expr::col("account_did").eq(did))
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&query, values)
            .execute(&mut *transaction)
            .await?;
        for repository in repositories {
            let (query, values) = Query::insert()
                .into_table("tangled_repositories")
                .columns(["uri", "account_did", "name", "data"])
                .values([
                    repository.uri.clone().into(),
                    did.into(),
                    repository.name.clone().into(),
                    serde_json::to_string(repository)?.into(),
                ])?
                .build_sqlx(SqliteQueryBuilder);
            sqlx::query_with(&query, values)
                .execute(&mut *transaction)
                .await?;
        }
        let (query, values) = Query::update()
            .table("tangled_sync")
            .value("started_at", 0i64)
            .value("updated_at", chrono::Utc::now().timestamp_millis())
            .value("error", Option::<String>::None)
            .and_where(Expr::col("account_did").eq(did))
            .build_sqlx(SqliteQueryBuilder);
        sqlx::query_with(&query, values)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(())
    }

    pub async fn tangled_repositories(
        &self,
        did: &str,
    ) -> Result<Vec<crate::tangled::TangledRepository>> {
        let (query, values) = Query::select()
            .column("data")
            .from("tangled_repositories")
            .and_where(Expr::col("account_did").eq(did))
            .order_by("name", Order::Asc)
            .limit(1000)
            .build_sqlx(SqliteQueryBuilder);
        let rows: Vec<String> = sqlx::query_scalar_with(&query, values)
            .fetch_all(&self.0)
            .await?;
        rows.iter()
            .map(|row| serde_json::from_str(row).map_err(Into::into))
            .collect()
    }
}

fn conflicting_name(name: &str, project_id: &str) -> SelectStatement {
    Query::select()
        .expr(Expr::val(1))
        .from("projects")
        .and_where(
            Expr::expr(Func::lower(Func::cust("trim").arg(Expr::col("name"))))
                .eq(Func::lower(name.trim())),
        )
        .and_where(Expr::col("id").ne(project_id))
        .to_owned()
}

fn search_query(expression: &str, project: Option<&str>, limit: u64) -> SelectStatement {
    // SQLite's FTS functions and MATCH use fixed SQL expressions. All user text,
    // project filters, unions, ordering and limits are bound by SeaQuery.
    let mut projects = Query::select();
    projects
        .column(("p", "id"))
        .expr_as(Expr::val("PROJECT"), "kind")
        .expr_as(Expr::col(("p", "id")), "project_id")
        .expr_as(Expr::cust("NULL"), "run_id")
        .expr_as(Expr::cust("NULL"), "job_id")
        .expr_as(
            Expr::cust("coalesce(json_extract(p.data, '$.displayName'), p.name)"),
            "title",
        )
        .expr_as(
            Expr::cust("snippet(project_search, -1, '', '', ' … ', 24)"),
            "excerpt",
        )
        .expr_as(Expr::col(("p", "created_at")), "created_at")
        .expr_as(Expr::cust("bm25(project_search, 5.0, 1.0)"), "score")
        .from("project_search")
        .join_as(
            JoinType::InnerJoin,
            "projects",
            "p",
            Expr::col(("p", "rowid")).equals(("project_search", "rowid")),
        )
        .and_where(Expr::cust_with_values(
            "project_search MATCH ?",
            [expression],
        ));
    let mut runs = Query::select();
    runs.column(("r", "id"))
        .expr(Expr::val("RUN"))
        .column(("r", "project_id"))
        .column(("r", "id"))
        .expr(Expr::cust("NULL"))
        .expr(Expr::cust(
            "coalesce(json_extract(r.data, '$.title'), r.id)",
        ))
        .expr(Expr::cust("snippet(run_search, -1, '', '', ' … ', 24)"))
        .column(("r", "date"))
        .expr(Expr::cust("bm25(run_search, 5.0, 1.0)"))
        .from("run_search")
        .join_as(
            JoinType::InnerJoin,
            "runs",
            "r",
            Expr::col(("r", "rowid")).equals(("run_search", "rowid")),
        )
        .and_where(Expr::cust_with_values("run_search MATCH ?", [expression]));
    let mut logs = Query::select();
    logs.column(("l", "id"))
        .expr(Expr::val("LOG"))
        .column(("r", "project_id"))
        .column(("r", "id"))
        .column(("j", "id"))
        .expr(Expr::cust("coalesce(json_extract(j.data, '$.name'), j.id)"))
        .expr(Expr::cust("snippet(log_search, 0, '', '', ' … ', 32)"))
        .column(("l", "created_at"))
        .expr(Expr::cust("bm25(log_search)"))
        .from("log_search")
        .join_as(
            JoinType::InnerJoin,
            "logs",
            "l",
            Expr::col(("l", "rowid")).equals(("log_search", "rowid")),
        )
        .join_as(
            JoinType::InnerJoin,
            "jobs",
            "j",
            Expr::col(("j", "id")).equals(("l", "job_id")),
        )
        .join_as(
            JoinType::InnerJoin,
            "runs",
            "r",
            Expr::col(("r", "id")).equals(("j", "run_id")),
        )
        .and_where(Expr::cust_with_values("log_search MATCH ?", [expression]));
    if let Some(project) = project {
        projects.and_where(Expr::col(("p", "id")).eq(project));
        runs.and_where(Expr::col(("r", "project_id")).eq(project));
        logs.and_where(Expr::col(("r", "project_id")).eq(project));
    }
    projects
        .union(UnionType::All, runs)
        .union(UnionType::All, logs);
    Query::select()
        .column(Asterisk)
        .from_subquery(projects, "matches")
        .order_by_expr(
            Expr::cust("CASE kind WHEN 'PROJECT' THEN 0 WHEN 'RUN' THEN 1 ELSE 2 END"),
            Order::Asc,
        )
        .order_by("score", Order::Asc)
        .order_by("created_at", Order::Desc)
        .order_by("id", Order::Asc)
        .limit(limit)
        .to_owned()
}
