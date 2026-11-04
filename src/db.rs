use crate::models::*;
use anyhow::{Context, Result};
use sqlx::{
    Row, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
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
            use std::os::unix::fs::OpenOptionsExt;

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
        let data: Option<String> = sqlx::query_scalar(
            "SELECT data FROM projects WHERE id=? OR name=? OR path=? ORDER BY created_at LIMIT 1",
        )
        .bind(key)
        .bind(key)
        .bind(key)
        .fetch_optional(&self.0)
        .await?;
        data.map(|d| serde_json::from_str(&d).map_err(Into::into))
            .transpose()
    }

    pub async fn projects(&self) -> Result<Vec<Project>> {
        let rows: Vec<String> =
            sqlx::query_scalar("SELECT data FROM projects ORDER BY created_at,id")
                .fetch_all(&self.0)
                .await?;
        rows.into_iter()
            .map(|d| Ok(serde_json::from_str(&d)?))
            .collect()
    }

    pub async fn save_project(&self, p: &Project) -> Result<()> {
        sqlx::query("INSERT INTO projects(id,name,path,created_at,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,path=excluded.path,data=excluded.data")
            .bind(&p.id).bind(&p.name).bind(&p.path).bind(&p.created_at).bind(serde_json::to_string(p)?).execute(&self.0).await?;
        Ok(())
    }

    pub async fn delete_project(&self, id: &str) -> Result<bool> {
        Ok(sqlx::query("DELETE FROM projects WHERE id=?")
            .bind(id)
            .execute(&self.0)
            .await?
            .rows_affected()
            > 0)
    }

    pub async fn actions(&self, project: &str) -> Result<Vec<Action>> {
        let rows: Vec<String> =
            sqlx::query_scalar("SELECT data FROM actions WHERE project_id=? ORDER BY position")
                .bind(project)
                .fetch_all(&self.0)
                .await?;
        rows.into_iter()
            .map(|d| Ok(serde_json::from_str(&d)?))
            .collect()
    }

    pub async fn save_actions(&self, project: &str, actions: &[Action]) -> Result<()> {
        let mut tx = self.0.begin().await?;
        sqlx::query("DELETE FROM actions WHERE project_id=?")
            .bind(project)
            .execute(&mut *tx)
            .await?;
        for (position, action) in actions.iter().enumerate() {
            sqlx::query("INSERT INTO actions(id,project_id,position,data) VALUES(?,?,?,?)")
                .bind(action.id.clone().unwrap_or_else(id))
                .bind(project)
                .bind(position as i64)
                .bind(serde_json::to_string(action)?)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn save_run(&self, r: &Run) -> Result<()> {
        let mut tx = self.0.begin().await?;
        let mut metadata = r.clone();
        metadata.jobs.clear();
        sqlx::query("INSERT INTO runs(id,project_id,date,status,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data")
            .bind(&r.id).bind(&r.project_id).bind(&r.date).bind(r.status.as_deref().unwrap_or("PENDING"))
            .bind(serde_json::to_string(&metadata)?).execute(&mut *tx).await?;
        for (position, j) in r.jobs.iter().enumerate() {
            let mut j = j.clone();
            j.logs = None;
            sqlx::query("INSERT INTO jobs(id,run_id,position,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data")
                .bind(&j.id).bind(&r.id).bind(position as i64).bind(serde_json::to_string(&j)?).execute(&mut *tx).await?;
        }
        for job in &r.jobs {
            for log in job.logs.iter().flatten() {
                sqlx::query("INSERT INTO logs(id,job_id,created_at,message) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING")
                .bind(&log.id).bind(&job.id).bind(&log.created_at).bind(&log.message).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn logs(&self, job: Option<&str>, project: Option<&str>) -> Result<Vec<Log>> {
        let rows = sqlx::query("SELECT l.* FROM logs l JOIN jobs j ON j.id=l.job_id JOIN runs r ON r.id=j.run_id WHERE (? IS NULL OR l.job_id=?) AND (? IS NULL OR r.project_id=?) ORDER BY l.created_at,l.rowid")
            .bind(job).bind(job).bind(project).bind(project).fetch_all(&self.0).await?;
        Ok(rows
            .into_iter()
            .map(|r| Log {
                id: r.get("id"),
                job_id: r.get("job_id"),
                message: r.get("message"),
                created_at: r.get("created_at"),
            })
            .collect())
    }

    pub async fn jobs(&self, run: Option<&str>) -> Result<Vec<Job>> {
        let rows: Vec<String> = sqlx::query_scalar(
            "SELECT data FROM jobs WHERE (? IS NULL OR run_id=?) ORDER BY position,rowid",
        )
        .bind(run)
        .bind(run)
        .fetch_all(&self.0)
        .await?;
        let mut jobs = Vec::new();
        for row in rows {
            let mut j: Job = serde_json::from_str(&row)?;
            j.logs = Some(self.logs(Some(&j.id), None).await?);
            jobs.push(j);
        }
        Ok(jobs)
    }

    pub async fn runs(&self, project: &str) -> Result<Vec<Run>> {
        let rows: Vec<String> =
            sqlx::query_scalar("SELECT data FROM runs WHERE project_id=? ORDER BY date,id")
                .bind(project)
                .fetch_all(&self.0)
                .await?;
        let mut runs = Vec::new();
        for row in rows {
            let mut r: Run = serde_json::from_str(&row)?;
            r.jobs = self.jobs(Some(&r.id)).await?;
            runs.push(r);
        }
        Ok(runs)
    }

    pub async fn run(&self, id: &str) -> Result<Option<Run>> {
        let data: Option<String> = sqlx::query_scalar("SELECT data FROM runs WHERE id=?")
            .bind(id)
            .fetch_optional(&self.0)
            .await?;
        if let Some(data) = data {
            let mut r: Run = serde_json::from_str(&data)?;
            r.jobs = self.jobs(Some(id)).await?;
            Ok(Some(r))
        } else {
            Ok(None)
        }
    }

    pub async fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(sqlx::query_scalar("SELECT value FROM settings WHERE key=?")
            .bind(key)
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
        let rows = sqlx::query(
            "SELECT * FROM (
                SELECT p.id AS id, 'PROJECT' AS kind, p.id AS project_id,
                       NULL AS run_id, NULL AS job_id,
                       coalesce(json_extract(p.data, '$.displayName'), p.name) AS title,
                       snippet(project_search, -1, '', '', ' … ', 24) AS excerpt,
                       p.created_at AS created_at, bm25(project_search, 5.0, 1.0) AS score
                FROM project_search JOIN projects p ON p.rowid = project_search.rowid
                WHERE project_search MATCH ? AND (? IS NULL OR p.id = ?)
                UNION ALL
                SELECT r.id, 'RUN', r.project_id, r.id, NULL,
                       coalesce(json_extract(r.data, '$.title'), r.id),
                       snippet(run_search, -1, '', '', ' … ', 24), r.date,
                       bm25(run_search, 5.0, 1.0)
                FROM run_search JOIN runs r ON r.rowid = run_search.rowid
                WHERE run_search MATCH ? AND (? IS NULL OR r.project_id = ?)
                UNION ALL
                SELECT l.id, 'LOG', r.project_id, r.id, j.id,
                       coalesce(json_extract(j.data, '$.name'), j.id),
                       snippet(log_search, 0, '', '', ' … ', 32), l.created_at,
                       bm25(log_search)
                FROM log_search JOIN logs l ON l.rowid = log_search.rowid
                JOIN jobs j ON j.id = l.job_id JOIN runs r ON r.id = j.run_id
                WHERE log_search MATCH ? AND (? IS NULL OR r.project_id = ?)
            ) ORDER BY CASE kind WHEN 'PROJECT' THEN 0 WHEN 'RUN' THEN 1 ELSE 2 END,
                       score, created_at DESC, id LIMIT ?",
        )
        .bind(&expression)
        .bind(project)
        .bind(project)
        .bind(&expression)
        .bind(project)
        .bind(project)
        .bind(&expression)
        .bind(project)
        .bind(project)
        .bind(limit.min(100))
        .fetch_all(&self.0)
        .await?;
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
        sqlx::query("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key).bind(value).execute(&self.0).await?;
        Ok(())
    }
}
