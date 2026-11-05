use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use fluentci::{
    db::Db,
    models::{Action, Project},
    server::{self, AppState},
};
use tower::ServiceExt;

async fn setup() -> anyhow::Result<(tempfile::TempDir, Db)> {
    let temp = tempfile::tempdir()?;
    let db = Db::open(&temp.path().join("db")).await?;
    Ok((temp, db))
}

#[tokio::test]
async fn graphql_crud_uses_sqlite() -> anyhow::Result<()> {
    let (temp, db) = setup().await?;
    let schema = server::schema(AppState::new(db.clone()));
    let response = schema
        .execute("mutation { createProject { id name } }")
        .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let value = response.data.into_json()?;
    let id = value["createProject"]["id"].as_str().unwrap();
    assert!(db.project(id).await?.is_some());
    let mut project = db.project(id).await?.unwrap();
    project.path = temp.path().to_string_lossy().into();
    db.save_project(&project).await?;
    let query = async_graphql::Request::new("query($id: ID!) { project(id:$id) { id name } }")
        .variables(async_graphql::Variables::from_json(
            serde_json::json!({"id":id}),
        ));
    assert!(schema.execute(query).await.errors.is_empty());
    let response=schema.execute(format!(r#"mutation {{ saveActions(projectId:"{id}",actions:[{{name:"hello",commands:"bash 'echo hello'",enabled:true,plugin:"shell",useWasm:true}}]){{name}} }}"#)).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(db.actions(id).await?.len(), 1);
    let response=schema.execute(format!(r#"mutation {{ runPipeline(projectId:"{id}",wait:true){{status jobs{{status logs{{message}}}}}} }}"#)).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(
        response.data.into_json()?["runPipeline"]["status"],
        "SUCCESS"
    );
    let response = schema
        .execute(format!(r#"mutation {{ deleteProject(id:"{id}") }}"#))
        .await;
    assert!(response.errors.is_empty());
    assert!(db.actions(id).await?.is_empty());
    Ok(())
}

#[tokio::test]
async fn serves_embedded_ui_and_spa_routes() -> anyhow::Result<()> {
    let (_temp, db) = setup().await?;
    let router = server::router(AppState::new(db), true);
    for path in ["/", "/project/123", "/run/123", "/auth", "/settings"] {
        let response = router
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty())?)
            .await?;
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        let body = to_bytes(response.into_body(), 10_000_000).await?;
        assert!(String::from_utf8_lossy(&body).contains("FluentCI Studio"));
    }
    let response = router
        .oneshot(
            Request::builder()
                .uri("/assets/missing.js")
                .body(Body::empty())?,
        )
        .await?;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    Ok(())
}

#[tokio::test]
async fn graphql_http_endpoint() -> anyhow::Result<()> {
    let (_temp, db) = setup().await?;
    let app = server::router(AppState::new(db), false);
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/graphql")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"query":"{ countProjects }"}"#))?,
        )
        .await?;
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), 10000).await?;
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&body)?["data"]["countProjects"],
        0
    );
    Ok(())
}

#[tokio::test]
async fn suggestions_read_declared_exports_and_saved_commands_without_building()
-> anyhow::Result<()> {
    let (temp, db) = setup().await?;
    std::fs::write(
        temp.path().join("fluentci.toml"),
        r#"
[[modules]]
name = "tools"
path = "tools.wasm"
[[modules]]
name = "unbuilt"
path = "source"
sdk = "typescript"
build = ["this-command-must-never-run"]
"#,
    )?;
    std::fs::create_dir(temp.path().join("source"))?;
    std::fs::write(
        temp.path().join("tools.wasm"),
        wat::parse_str(
            r#"(module
      (func (export "test")) (func (export "build")) (func (export "__internal")))"#,
        )?,
    )?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    db.save_actions(
        &project.id,
        &[Action {
            name: "Saved".into(),
            plugin: "tools".into(),
            commands: "test --release\ncustom arg\ntest".into(),
            enabled: true,
            ..Action::default()
        }],
    )
    .await?;
    let schema = server::schema(AppState::new(db));
    let response = schema
        .execute(format!(
            r#"{{ actionSuggestions(projectId:"{}") {{ name functions }} }}"#,
            project.id
        ))
        .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let modules = response.data.into_json()?["actionSuggestions"]
        .as_array()
        .unwrap()
        .clone();
    let tools = modules
        .iter()
        .find(|module| module["name"] == "tools")
        .unwrap();
    assert_eq!(
        tools["functions"],
        serde_json::json!(["build", "custom", "test"])
    );
    assert!(
        modules
            .iter()
            .any(|module| module["name"] == "unbuilt"
                && module["functions"] == serde_json::json!([]))
    );
    Ok(())
}

#[test]
fn ci_exports_use_the_requested_setup_and_installer() -> anyhow::Result<()> {
    let github = fluentci::export::generate("github", &[])?;
    assert!(github.contains("fluentci-io/setup-fluentci@next"));
    for provider in ["gitlab", "azure", "circleci", "aws"] {
        let yaml = fluentci::export::generate(provider, &[])?;
        assert!(yaml.contains("curl -fsSL https://raw.githubusercontent.com/tsirysndr/fluentci/main/install.sh | sh"), "{provider}: {yaml}");
    }
    Ok(())
}

#[tokio::test]
async fn directory_suggestions_stay_inside_the_project() -> anyhow::Result<()> {
    let (temp, db) = setup().await?;
    std::fs::create_dir_all(temp.path().join("webui/src/components"))?;
    std::fs::create_dir_all(temp.path().join("node_modules/ignored"))?;
    std::fs::create_dir_all(temp.path().join(".git/objects"))?;
    let outside = tempfile::tempdir()?;
    std::fs::create_dir(outside.path().join("outside"))?;
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), temp.path().join("linked"))?;
    let project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    let response = server::schema(AppState::new(db))
        .execute(format!(
            r#"{{ projectDirectories(projectId:"{}") }}"#,
            project.id
        ))
        .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(
        response.data.into_json()?["projectDirectories"],
        serde_json::json!([".", "webui", "webui/src", "webui/src/components"])
    );
    Ok(())
}

#[tokio::test]
async fn renaming_validates_unique_names_and_preserves_display_names() -> anyhow::Result<()> {
    let (_temp, db) = setup().await?;
    let mut first = Project::new("empty".into());
    first.name = "first".into();
    first.display_name = Some("Friendly title".into());
    let mut second = Project::new("empty".into());
    second.name = "taken".into();
    db.save_project(&first).await?;
    db.save_project(&second).await?;
    let schema = server::schema(AppState::new(db.clone()));
    for name in ["taken", " TAKEN ", "   "] {
        let response = schema
            .execute(format!(
                r#"mutation {{ updateProject(id:"{}",projectName:"{name}") {{ name }} }}"#,
                first.id
            ))
            .await;
        assert!(!response.errors.is_empty(), "Accepted {name:?}");
        assert_eq!(db.project(&first.id).await?.unwrap().name, "first");
    }
    let response = schema.execute(format!(r#"mutation {{ updateProject(id:"{}",projectName:" renamed ") {{ name displayName }} }}"#, first.id)).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let project = db.project(&first.id).await?.unwrap();
    assert_eq!(project.name, "renamed");
    assert_eq!(project.display_name.as_deref(), Some("Friendly title"));
    let response = schema
        .execute(format!(
            r#"{{ projectNameAvailable(name:"RENAMED",projectId:"{}") }}"#,
            second.id
        ))
        .await;
    assert_eq!(response.data.into_json()?["projectNameAvailable"], false);
    Ok(())
}

#[tokio::test]
async fn simultaneous_renames_cannot_claim_the_same_name() -> anyhow::Result<()> {
    let (_temp, db) = setup().await?;
    let mut first = Project::new("empty".into());
    let mut second = Project::new("empty".into());
    db.save_project(&first).await?;
    db.save_project(&second).await?;
    first.name = "same".into();
    second.name = "SAME".into();
    let (one, two) = tokio::join!(
        db.save_project_with_unique_name(&first),
        db.save_project_with_unique_name(&second)
    );
    assert_ne!(one.is_ok(), two.is_ok());
    assert_eq!(
        db.projects()
            .await?
            .iter()
            .filter(|project| project.name.eq_ignore_ascii_case("same"))
            .count(),
        1
    );
    Ok(())
}

#[tokio::test]
async fn rerunning_a_job_executes_only_that_action_and_preserves_history() -> anyhow::Result<()> {
    let (temp, db) = setup().await?;
    let project = Project::new(temp.path().to_string_lossy().into_owned());
    db.save_project(&project).await?;
    db.save_actions(
        &project.id,
        &[
            Action {
                name: "first".into(),
                plugin: "shell".into(),
                commands: "echo first".into(),
                enabled: true,
                ..Default::default()
            },
            Action {
                name: "second".into(),
                plugin: "shell".into(),
                commands: "echo second".into(),
                enabled: true,
                ..Default::default()
            },
        ],
    )
    .await?;
    let original = fluentci::executor::execute(db.clone(), project.clone(), None).await?;
    let schema = server::schema(AppState::new(db.clone()));
    let response = schema.execute(format!(r#"mutation {{ runPipeline(projectId:"{}",jobName:"second",wait:true) {{ id status jobs {{ name status logs {{ message }} }} }} }}"#, project.id)).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let data = response.data.into_json()?;
    let run = &data["runPipeline"];
    assert_ne!(run["id"].as_str(), Some(original.id.as_str()));
    assert_eq!(run["status"], "SUCCESS");
    assert_eq!(run["jobs"][0]["status"], "SKIPPED");
    assert!(run["jobs"][0]["logs"].is_null());
    assert_eq!(run["jobs"][1]["status"], "SUCCESS");
    assert_eq!(run["jobs"][1]["logs"][0]["message"], "second");
    assert_eq!(
        db.run(&original.id).await?.unwrap().jobs[0].status,
        "SUCCESS"
    );
    let invalid = schema
        .execute(format!(
            r#"mutation {{ runPipeline(projectId:"{}",jobName:"removed",wait:false) {{ id }} }}"#,
            project.id
        ))
        .await;
    assert!(!invalid.errors.is_empty());
    assert_eq!(db.runs(&project.id).await?.len(), 2);
    Ok(())
}
