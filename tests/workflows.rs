use fluentci::{
    db::Db,
    executor,
    models::{Action, Project, Run},
    server::{self, AppState},
    workflows::{self, Update},
};
use serde_json::json;

async fn setup() -> anyhow::Result<(tempfile::TempDir, Db, Project)> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("studio.db")).await?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    Ok((temp, db, project))
}

fn action(name: &str, command: &str) -> Action {
    Action {
        name: name.into(),
        plugin: "shell".into(),
        commands: command.into(),
        enabled: true,
        ..Action::default()
    }
}

#[tokio::test]
async fn workflow_files_are_authoritative_and_edits_use_revisions() -> anyhow::Result<()> {
    let (temp, db, project) = setup().await?;
    db.save_actions(&project.id, &[action("default", "printf default")])
        .await?;
    let original = workflows::list(&db, &project).await?;
    assert_eq!(original.len(), 1);
    assert!(original[0].legacy);
    let workflow = workflows::create(&db, &project, "ci", "Checks", None, Some("default")).await?;
    assert_eq!(workflow.step_count, 1);
    let revision = workflow.revision.clone();
    let renamed = workflows::update(
        &db,
        &project,
        "ci",
        Update {
            name: Some("Continuous integration".into()),
            expected_revision: revision.clone(),
            ..Default::default()
        },
    )
    .await?;
    assert_eq!(renamed.id, "ci");
    assert_ne!(renamed.revision, revision);
    assert!(
        workflows::update(
            &db,
            &project,
            "ci",
            Update {
                actions: Some(vec![]),
                expected_revision: revision,
                ..Default::default()
            }
        )
        .await
        .is_err()
    );
    assert!(
        workflows::create(&db, &project, "ci", "Duplicate", None, None)
            .await
            .is_err()
    );
    assert!(
        workflows::create(&db, &project, "../escape", "Invalid", None, None)
            .await
            .is_err()
    );
    let path = temp.path().join(".fluentci/workflows/ci.toml");
    let content = std::fs::read_to_string(&path)?;
    // File names are independent of stable IDs, and hand edits are reflected immediately.
    std::fs::write(
        &path,
        content.replace("Continuous integration", "Hand edited"),
    )?;
    std::fs::rename(path, temp.path().join(".fluentci/workflows/checks.toml"))?;
    assert_eq!(
        workflows::definition(&db, &project, "ci").await?.name,
        "Hand edited"
    );
    assert_eq!(
        workflows::actions(&db, &project, "default").await?[0].name,
        "default"
    );
    // First editing the legacy workflow also checks for concurrent materialization.
    workflows::update(
        &db,
        &project,
        "default",
        Update {
            name: Some("Default checks".into()),
            expected_revision: Some(String::new()),
            ..Default::default()
        },
    )
    .await?;
    assert!(
        workflows::update(
            &db,
            &project,
            "default",
            Update {
                actions: Some(vec![]),
                expected_revision: Some(String::new()),
                ..Default::default()
            }
        )
        .await
        .is_err()
    );
    assert!(workflows::delete(&project, "default", None).await.is_err());
    Ok(())
}

#[tokio::test]
async fn prepared_runs_keep_workflow_actions_environment_and_history_after_deletion()
-> anyhow::Result<()> {
    let (_temp, db, project) = setup().await?;
    workflows::create(&db, &project, "release", "Release", None, None).await?;
    let mut first = action("publish", "printf '%s' \"$WORKFLOW_VALUE\"");
    first.env = Some(vec!["WORKFLOW_VALUE=step".into()]);
    workflows::update(
        &db,
        &project,
        "release",
        Update {
            env: Some(vec!["WORKFLOW_VALUE=workflow".into()]),
            actions: Some(vec![first, action("after", "printf after")]),
            ..Default::default()
        },
    )
    .await?;
    let run = executor::prepare_workflow(&db, &project, "release", Some("publish")).await?;
    assert_eq!(run.jobs[1].status, "SKIPPED");
    assert_eq!(run.workflow_id, "release");
    workflows::update(
        &db,
        &project,
        "release",
        Update {
            actions: Some(vec![action("changed", "exit 8")]),
            ..Default::default()
        },
    )
    .await?;
    workflows::delete(&project, "release", None).await?;
    let result = executor::execute_prepared(db.clone(), project.clone(), run, None).await?;
    assert_eq!(result.status.as_deref(), Some("SUCCESS"));
    assert_eq!(result.workflow_name.as_deref(), Some("Release"));
    assert_eq!(db.logs(None, Some(&project.id)).await?[0].message, "step");
    assert_eq!(
        db.workflow_runs(&project.id, Some("release")).await?.len(),
        1
    );
    assert!(
        db.workflow_runs(&project.id, Some("default"))
            .await?
            .is_empty()
    );
    assert_eq!(db.runs(&project.id).await?.len(), 1);
    let old: Run = serde_json::from_value(
        json!({"id":"old","name":"old","project":"p","projectId":"p","title":"old","duration":0,"date":"","jobs":[]}),
    )?;
    assert_eq!(old.workflow_id, "default");
    Ok(())
}

#[tokio::test]
async fn graphql_workflows_scope_actions_exports_runs_and_archived_mutations() -> anyhow::Result<()>
{
    let (_temp, db, mut project) = setup().await?;
    let schema = server::schema(AppState::new(db.clone()));
    let execute = |query: &str, variables| {
        async_graphql::Request::new(query).variables(async_graphql::Variables::from_json(variables))
    };
    let response = schema.execute(execute("mutation($id: ID!) { createWorkflow(projectId:$id,input:{id:\"ci\",name:\"Checks\"}) { id } }", json!({"id":project.id}))).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let response = schema.execute(execute("mutation($id: ID!, $actions: [ActionInput!]!) { saveActions(projectId:$id,workflowId:\"ci\",actions:$actions) { name } }", json!({"id":project.id,"actions":[{"name":"only ci","commands":"printf ci","enabled":true,"plugin":"shell","useWasm":false}]}))).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let response = schema.execute(execute("query($id: ID!) { actions(projectId:$id,workflowId:\"ci\"){name} exportActions(projectId:$id,workflowId:\"ci\",plateform:\"github\") workflows(projectId:$id){id stepCount} }", json!({"id":project.id}))).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let data = response.data.into_json()?;
    assert_eq!(data["actions"][0]["name"], "only ci");
    assert!(
        data["exportActions"]
            .as_str()
            .unwrap()
            .contains("printf ci")
    );
    let response = schema.execute(execute("mutation($id: ID!) { runPipeline(projectId:$id,workflowId:\"ci\",wait:true) {workflowId status} }", json!({"id":project.id}))).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(
        response.data.into_json()?["runPipeline"]["status"],
        "SUCCESS"
    );
    let response = schema.execute(execute("query($id: ID!) { getRuns(projectId:$id,workflowId:\"default\"){id} countRuns(projectId:$id,workflowId:\"ci\") }", json!({"id":project.id}))).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let data = response.data.into_json()?;
    assert_eq!(data["getRuns"], json!([]));
    assert_eq!(data["countRuns"], 1);
    workflows::update(
        &db,
        &project,
        "ci",
        Update {
            enabled: Some(false),
            ..Default::default()
        },
    )
    .await?;
    assert!(
        executor::prepare_workflow(&db, &project, "ci", None)
            .await
            .is_err()
    );
    project.archived = Some(true);
    db.save_project(&project).await?;
    let response = schema.execute(execute("mutation($id: ID!) { updateWorkflow(projectId:$id,workflowId:\"ci\",input:{enabled:true}) {id} }", json!({"id":project.id}))).await;
    assert!(!response.errors.is_empty());
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn workflow_storage_rejects_duplicates_and_symlinks_outside_project() -> anyhow::Result<()> {
    let (temp, db, project) = setup().await?;
    workflows::create(&db, &project, "ci", "Checks", None, None).await?;
    let directory = temp.path().join(".fluentci/workflows");
    std::fs::copy(directory.join("ci.toml"), directory.join("duplicate.toml"))?;
    assert!(workflows::list(&db, &project).await.is_err());
    std::fs::remove_file(directory.join("duplicate.toml"))?;
    let external = tempfile::tempdir()?;
    std::os::unix::fs::symlink(
        external.path().join("workflow.toml"),
        directory.join("linked.toml"),
    )?;
    assert!(workflows::list(&db, &project).await.is_err());
    std::fs::remove_file(directory.join("linked.toml"))?;
    std::fs::remove_dir_all(&directory)?;
    std::os::unix::fs::symlink(external.path(), &directory)?;
    assert!(
        workflows::create(&db, &project, "unsafe", "Unsafe", None, None)
            .await
            .is_err()
    );
    assert!(std::fs::read_dir(external.path())?.next().is_none());
    Ok(())
}

#[test]
fn workflow_events_translate_to_provider_conditions_and_validate_inputs() -> anyhow::Result<()> {
    let definition: fluentci::workflows::Definition = toml::from_str(
        r#"
id = "ci"
name = "Workspace checks"
[on]
manual = true
schedule = ["0 6 * * 1-5"]
[on.push]
branches = ["main", "release/**"]
tags = ["v*"]
paths = ["src/**"]
[on.pull_request]
branches = ["main"]
paths = ["src/**"]
[[steps]]
name = "check"
module = "shell"
command = "printf ok"
"#,
    )?;
    let parse = |provider| -> anyhow::Result<serde_json::Value> {
        Ok(serde_yaml::from_str(&fluentci::export::generate_workflow(
            provider,
            &definition,
        )?)?)
    };
    let github = parse("github")?;
    assert_eq!(github["name"], "Workspace checks");
    assert_eq!(github["on"]["push"]["branches"][1], "release/**");
    assert_eq!(github["on"]["pull_request"]["paths"][0], "src/**");
    assert_eq!(github["on"]["schedule"][0]["cron"], "0 6 * * 1-5");
    assert!(github["on"]["workflow_dispatch"].is_object());
    assert!(
        github["jobs"]["tasks"]["steps"][2]["run"]
            .as_str()
            .unwrap()
            .contains("printf ok")
    );
    let gitlab = parse("gitlab")?;
    let rules = gitlab["workflow"]["rules"].as_array().unwrap();
    assert!(rules.iter().any(|rule| {
        rule["if"].as_str().is_some_and(|s| {
            s.contains("merge_request_event") && s.contains("CI_MERGE_REQUEST_TARGET_BRANCH_NAME")
        })
    }));
    assert_eq!(rules[0]["changes"]["paths"][0], "src/**");
    assert_eq!(rules[1]["changes"], serde_json::Value::Null); // tag pushes ignore path filters
    assert_eq!(rules.last().unwrap()["when"], "never");
    let azure = parse("azure")?;
    assert_eq!(azure["trigger"]["tags"]["include"][0], "v*");
    assert_eq!(azure["pr"]["branches"]["include"][0], "main");
    assert_eq!(azure["schedules"][0]["cron"], "0 6 * * 1-5");
    let aws = fluentci::export::generate_workflow("aws", &definition)?;
    assert!(aws.contains("filterGroups") && aws.contains("BASE_REF") && aws.contains("FILE_PATH"));
    // Unsupported mappings must not silently broaden execution.
    assert!(fluentci::export::generate_workflow("circleci", &definition).is_err());
    let mut circle = definition.clone();
    circle.events.push.as_mut().unwrap().paths.clear();
    circle.events.pull_request.as_mut().unwrap().paths.clear();
    assert!(
        fluentci::export::generate_workflow("circleci", &circle)?.contains("pipeline.event.name")
    );
    for cron in [
        "every day",
        "60 * * * *",
        "0 24 * * *",
        "0 0 0 * *",
        "*/0 * * * *",
    ] {
        let mut invalid = definition.clone();
        invalid.events.schedule = vec![cron.into()];
        assert!(invalid.validate().is_err(), "{cron}");
    }
    Ok(())
}

#[tokio::test]
async fn ci_events_do_not_gate_manual_local_execution() -> anyhow::Result<()> {
    let (_temp, db, project) = setup().await?;
    workflows::create(&db, &project, "manual", "Manual local", None, None).await?;
    workflows::update(
        &db,
        &project,
        "manual",
        Update {
            events: Some(fluentci::models::WorkflowEvents {
                push: None,
                pull_request: None,
                manual: false,
                schedule: vec![],
            }),
            actions: Some(vec![action("local", "printf local")]),
            ..Default::default()
        },
    )
    .await?;
    let run = executor::prepare_workflow(&db, &project, "manual", None).await?;
    let run = executor::execute_prepared(db, project, run, None).await?;
    assert_eq!(run.status.as_deref(), Some("SUCCESS"));
    Ok(())
}

#[tokio::test]
async fn database_with_migration_three_upgrades_without_losing_projects() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let migration_directory = temp.path().join("old-migrations");
    std::fs::create_dir(&migration_directory)?;
    for name in [
        "0001_initial.sql",
        "0002_studio_search.sql",
        "0003_tangled_repositories.sql",
    ] {
        std::fs::copy(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("migrations")
                .join(name),
            migration_directory.join(name),
        )?;
    }
    let path = temp.path().join("existing.db");
    let pool = sqlx::SqlitePool::connect_with(
        sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true),
    )
    .await?;
    sqlx::migrate::Migrator::new(migration_directory)
        .await?
        .run(&pool)
        .await?;
    let project = Project::new(temp.path().to_string_lossy().into());
    sqlx::query("INSERT INTO projects(id,name,path,created_at,data) VALUES(?,?,?,?,?)")
        .bind(&project.id)
        .bind(&project.name)
        .bind(&project.path)
        .bind(&project.created_at)
        .bind(serde_json::to_string(&project)?)
        .execute(&pool)
        .await?;
    pool.close().await;
    let db = Db::open(&path).await?;
    assert_eq!(db.project(&project.id).await?.unwrap().path, project.path);
    assert!(
        workflows::list(&db, &project)
            .await?
            .iter()
            .any(|workflow| workflow.id == "default")
    );
    Ok(())
}
