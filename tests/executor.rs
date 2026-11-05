use fluentci::{db::Db, executor, models::*};

#[tokio::test]
async fn executes_shell_actions_and_persists_output_and_status() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    let action = Action {
        name: "hello".into(),
        plugin: "shell".into(),
        commands: "bash 'printf \"hello\\n\"; printf \"stderr\\n\" >&2'".into(),
        enabled: true,
        use_wasm: true,
        ..Action::default()
    };
    db.save_actions(&project.id, &[action]).await?;
    let (events, mut received) = tokio::sync::broadcast::channel(32);
    let result = executor::execute(db.clone(), project.clone(), Some(events)).await?;
    assert_eq!(result.status.as_deref(), Some("SUCCESS"));
    assert_eq!(result.jobs[0].status, "SUCCESS");
    let logs = db.logs(None, Some(&project.id)).await?;
    assert_eq!(logs.len(), 2);
    assert!(logs.iter().any(|l| l.message == "hello"));
    let mut streamed = Vec::new();
    while let Ok(event) = received.try_recv() {
        let event: serde_json::Value = serde_json::from_str(&event)?;
        if event["channel"] == "logs" {
            streamed.push(event["data"].clone());
        }
    }
    assert_eq!(streamed.len(), logs.len());
    for log in &logs {
        let event = streamed.iter().find(|event| event["id"] == log.id).unwrap();
        assert_eq!(event["createdAt"], log.created_at);
        assert_eq!(event["text"], log.message);
        assert_eq!(event["jobId"], log.job_id);
        assert_eq!(event["runId"], result.id);
    }
    assert_eq!(
        db.project(&project.id).await?.unwrap().reliability,
        Some(100.0)
    );
    Ok(())
}

#[tokio::test]
async fn records_failure_and_skips_subsequent_actions() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let p = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&p).await?;
    let failing = Action {
        name: "fail".into(),
        plugin: "shell".into(),
        commands: "bash 'exit 42'".into(),
        enabled: true,
        ..Action::default()
    };
    let next = Action {
        name: "next".into(),
        plugin: "shell".into(),
        commands: "bash 'touch should-not-exist'".into(),
        enabled: true,
        ..Action::default()
    };
    db.save_actions(&p.id, &[failing, next]).await?;
    assert!(
        executor::execute(db.clone(), p.clone(), None)
            .await
            .is_err()
    );
    let runs = db.runs(&p.id).await?;
    assert_eq!(runs[0].status.as_deref(), Some("FAILURE"));
    assert_eq!(runs[0].jobs[0].status, "FAILURE");
    assert_eq!(runs[0].jobs[1].status, "SKIPPED");
    assert!(!temp.path().join("should-not-exist").exists());
    Ok(())
}

#[tokio::test]
async fn handles_multiline_scripts_and_command_arrays() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    let config = fluentci::config::Config::parse(
        "[[steps]]\nname='multiline'\ncommand=['printf \"one\\n\"', 'printf \"two\\n\"']",
    )?;
    db.save_actions(&project.id, &config.actions()?).await?;
    let result = executor::execute(db.clone(), project, None).await?;
    assert_eq!(result.status.as_deref(), Some("SUCCESS"));
    assert_eq!(
        result.jobs[0]
            .logs
            .as_ref()
            .unwrap()
            .iter()
            .map(|l| l.message.as_str())
            .collect::<Vec<_>>(),
        ["one", "two"]
    );
    Ok(())
}

#[tokio::test]
async fn cancels_an_active_process_and_persists_terminal_status() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    db.save_actions(
        &project.id,
        &[Action {
            name: "wait".into(),
            plugin: "shell".into(),
            commands: "bash 'echo started; exec sleep 30'".into(),
            enabled: true,
            ..Action::default()
        }],
    )
    .await?;
    let run = executor::prepare(&db, &project).await?;
    let run_id = run.id.clone();
    let task = tokio::spawn(executor::execute_prepared(db.clone(), project, run, None));
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            if !db.logs(None, None).await?.is_empty() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        anyhow::Ok(())
    })
    .await??;
    let mut run = db.run(&run_id).await?.unwrap();
    run.status = Some("CANCELLED".into());
    db.save_run(&run).await?;
    assert!(
        tokio::time::timeout(std::time::Duration::from_secs(5), task)
            .await??
            .is_err()
    );
    assert_eq!(
        db.run(&run_id).await?.unwrap().status.as_deref(),
        Some("CANCELLED")
    );
    Ok(())
}
