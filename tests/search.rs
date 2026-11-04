use fluentci::{
    db::Db,
    models::{Job, Log, Project, Run, id, now},
    server::{self, AppState},
};
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};

async fn seed(db: &Db, name: &str) -> anyhow::Result<(Project, Run)> {
    let mut project = Project::new(format!("/workspace/{name}"));
    project.display_name = Some(format!("Café {name}"));
    project.tags = Some(vec!["deployment".into()]);
    db.save_project(&project).await?;
    let job_id = id();
    let run = Run {
        id: id(),
        project_id: project.id.clone(),
        title: format!("Release {name}"),
        status: Some("SUCCESS".into()),
        branch: Some("feature/search".into()),
        date: now(),
        jobs: vec![Job {
            id: job_id.clone(),
            name: "Compile engine".into(),
            status: "SUCCESS".into(),
            created_at: now(),
            logs: Some(vec![Log {
                id: id(),
                job_id,
                message: "Compiling release artifacts with SQLite".into(),
                created_at: now(),
            }]),
            ..Job::default()
        }],
        ..Run::default()
    };
    db.save_run(&run).await?;
    Ok((project, run))
}

#[tokio::test]
async fn searches_projects_runs_and_logs_with_prefixes_and_project_scope() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let (project, run) = seed(&db, "studio").await?;
    let (other, _) = seed(&db, "other").await?;
    assert_eq!(db.search("cafe stu", None, 30).await?[0].id, project.id);
    assert_eq!(db.search("deploy", None, 30).await?.len(), 2);
    assert_eq!(db.search("release stu", None, 30).await?[0].id, run.id);
    let logs = db.search("compil rele", Some(&project.id), 30).await?;
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].kind, "LOG");
    assert_eq!(logs[0].run_id.as_deref(), Some(run.id.as_str()));
    assert_eq!(logs[0].job_id.as_deref(), Some(run.jobs[0].id.as_str()));
    assert!(logs[0].excerpt.contains("Compiling release"));
    assert!(db.search("studio", Some(&other.id), 30).await?.is_empty());
    for input in [
        "",
        "   ",
        "\"*():-",
        "NEAR(foo)",
        "\" OR *",
        "é",
        "foo\0bar",
    ] {
        db.search(input, None, 30).await?;
    }
    assert!(db.search("release", None, 0).await?.is_empty());
    assert_eq!(db.search("release", None, 1).await?.len(), 1);
    let schema = server::schema(AppState::new(db));
    let response = schema
        .execute(format!(
            "{{ search(query: \"compil rele\", projectId: \"{}\", limit: 5) {{ kind runId jobId excerpt }} }}",
            project.id
        ))
        .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(response.data.into_json()?["search"][0]["kind"], "LOG");
    Ok(())
}

#[tokio::test]
async fn updates_indexes_and_cascades_deletes_without_stale_results() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let path = temp.path().join("db");
    let db = Db::open(&path).await?;
    let (mut project, mut run) = seed(&db, "original").await?;
    project.display_name = Some("Renamed workspace".into());
    project.path = "/workspace/renamed".into();
    db.save_project(&project).await?;
    assert_eq!(db.search("renam", None, 30).await?[0].id, project.id);
    assert!(
        !db.search("cafe", None, 30)
            .await?
            .iter()
            .any(|hit| hit.id == project.id)
    );
    run.title = "Updated execution".into();
    run.status = Some("FAILURE".into());
    run.message = Some("Connection refused".into());
    db.save_run(&run).await?;
    // Re-saving an existing run must not index the same log twice.
    db.save_run(&run).await?;
    assert_eq!(db.search("compil", None, 30).await?.len(), 1);
    assert_eq!(db.search("refused", None, 30).await?[0].id, run.id);
    drop(db);
    let db = Db::open(&path).await?;
    assert_eq!(db.search("compil", None, 30).await?.len(), 1);
    db.delete_project(&project.id).await?;
    assert!(db.search("renamed", None, 30).await?.is_empty());
    assert!(db.search("updated", None, 30).await?.is_empty());
    assert!(db.search("compil", None, 30).await?.is_empty());
    Ok(())
}

#[tokio::test]
async fn migrates_and_backfills_existing_sqlite_history() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let migrations = temp.path().join("migrations");
    tokio::fs::create_dir(&migrations).await?;
    tokio::fs::write(
        migrations.join("0001_initial.sql"),
        include_str!("../migrations/0001_initial.sql"),
    )
    .await?;
    let path = temp.path().join("db");
    let pool = SqlitePoolOptions::new()
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true),
        )
        .await?;
    Migrator::new(migrations.as_path())
        .await?
        .run(&pool)
        .await?;
    let mut project = Project::new("/workspace/legacy".into());
    project.display_name = Some("Legacy project".into());
    sqlx::query("INSERT INTO projects(id,name,path,created_at,data) VALUES(?,?,?,?,?)")
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.path)
        .bind(&project.created_at)
        .bind(serde_json::to_string(&project)?)
        .execute(&pool)
        .await?;
    sqlx::query(
        "INSERT INTO runs(id,project_id,date,status,data) VALUES('legacy-run',?,?, 'SUCCESS', ?)",
    )
    .bind(&project.id)
    .bind(now())
    .bind(r#"{"title":"Legacy execution"}"#)
    .execute(&pool)
    .await?;
    sqlx::query("INSERT INTO jobs(id,run_id,position,data) VALUES('legacy-job','legacy-run',0,?)")
        .bind(r#"{"name":"Build"}"#)
        .execute(&pool)
        .await?;
    sqlx::query("INSERT INTO logs(id,job_id,created_at,message) VALUES('legacy-log','legacy-job',?,'legacy persisted output')")
        .bind(now()).execute(&pool).await?;
    pool.close().await;
    let db = Db::open(&path).await?;
    let hits = db.search("legacy", None, 30).await?;
    assert_eq!(hits.len(), 3);
    assert_eq!(hits[0].kind, "PROJECT");
    assert_eq!(hits[1].kind, "RUN");
    assert_eq!(hits[2].kind, "LOG");
    Ok(())
}
