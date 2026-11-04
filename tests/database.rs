use fluentci::{db::Db, models::*};

#[tokio::test]
async fn persists_relations_and_cascades_deletes() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("fluentci.db");
    let db = Db::open(&path).await?;
    let project = Project::new("/workspace".into());
    db.save_project(&project).await?;
    let action = Action {
        id: Some(id()),
        name: "test".into(),
        commands: "test".into(),
        plugin: "rust".into(),
        enabled: true,
        use_wasm: true,
        ..Action::default()
    };
    db.save_actions(&project.id, std::slice::from_ref(&action))
        .await?;
    let job_id = id();
    let run = Run {
        id: id(),
        project_id: project.id.clone(),
        date: now(),
        status: Some("SUCCESS".into()),
        jobs: vec![Job {
            id: job_id.clone(),
            name: "test".into(),
            status: "SUCCESS".into(),
            created_at: now(),
            logs: Some(vec![
                Log {
                    id: id(),
                    job_id: job_id.clone(),
                    message: "first".into(),
                    created_at: now(),
                },
                Log {
                    id: id(),
                    job_id: job_id.clone(),
                    message: "second".into(),
                    created_at: now(),
                },
            ]),
            ..Job::default()
        }],
        ..Run::default()
    };
    db.save_run(&run).await?;
    db.save_run(&run).await?;
    drop(db);
    let db = Db::open(&path).await?;
    assert_eq!(db.actions(&project.id).await?[0].name, "test");
    assert_eq!(
        db.run(&run.id).await?.unwrap().jobs[0]
            .logs
            .as_ref()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(db.logs(Some(&job_id), None).await?.len(), 2);
    assert!(db.delete_project(&project.id).await?);
    assert!(db.run(&run.id).await?.is_none());
    assert!(db.actions(&project.id).await?.is_empty());
    assert!(db.logs(None, None).await?.is_empty());
    Ok(())
}

#[tokio::test]
async fn replaces_actions_atomically_and_enforces_foreign_keys() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let project = Project::new("empty".into());
    db.save_project(&project).await?;
    let action = Action {
        id: Some(id()),
        name: "original".into(),
        ..Action::default()
    };
    db.save_actions(&project.id, std::slice::from_ref(&action))
        .await?;
    assert!(
        db.save_actions(&project.id, &[action.clone(), action.clone()])
            .await
            .is_err()
    );
    assert_eq!(db.actions(&project.id).await?[0].name, "original");
    assert!(db.save_actions("missing", &[action]).await.is_err());
    let mut renamed = project.clone();
    renamed.name = "renamed".into();
    renamed.path = "/new/path".into();
    db.save_project(&renamed).await?;
    assert!(db.project(&project.name).await?.is_none());
    assert!(db.project("empty").await?.is_none());
    assert!(db.project("renamed").await?.is_some());
    Ok(())
}

#[tokio::test]
async fn same_timestamp_runs_are_not_lost() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let p = Project::new("empty".into());
    db.save_project(&p).await?;
    let date = now();
    for _ in 0..3 {
        db.save_run(&Run {
            id: id(),
            project_id: p.id.clone(),
            date: date.clone(),
            ..Run::default()
        })
        .await?;
    }
    assert_eq!(db.runs(&p.id).await?.len(), 3);
    Ok(())
}
