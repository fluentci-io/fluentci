use fluentci::{
    db::Db,
    server::{self, AppState},
};
use fluentci_desktop::backend::{DesktopBackend, open_project};
use serde_json::{Value, json};

async fn count_projects(client: &reqwest::Client, origin: &str) -> anyhow::Result<i64> {
    let value: Value = client
        .post(format!("{origin}/graphql"))
        .json(&json!({"query":"{ countProjects }"}))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(value["data"]["countProjects"].as_i64().unwrap())
}

#[tokio::test]
async fn desktop_uses_a_separate_port_and_shutdown_does_not_stop_studio() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let database = temp.path().join("shared.db");
    let studio_listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
    let studio_address = studio_listener.local_addr()?;
    let studio_router = server::router(AppState::new(Db::open(&database).await?), true);
    let studio = tokio::spawn(async move { axum::serve(studio_listener, studio_router).await });
    let desktop = DesktopBackend::start(&database).await?;
    assert_ne!(desktop.address, studio_address);
    assert!(desktop.address.ip().is_loopback());
    assert_ne!(desktop.address.port(), 6076);
    let client = reqwest::Client::new();
    let desktop_url = desktop.url();
    assert_eq!(count_projects(&client, &desktop_url).await?, 0);
    let folder = temp.path().join("project");
    std::fs::create_dir(&folder)?;
    let project = open_project(&desktop.state, &folder).await?;
    assert_eq!(open_project(&desktop.state, &folder).await?.id, project.id);
    assert_eq!(count_projects(&client, &desktop_url).await?, 1);
    assert_eq!(
        count_projects(&client, &format!("http://{studio_address}")).await?,
        1
    );
    assert!(
        client
            .get(&desktop_url)
            .send()
            .await?
            .text()
            .await?
            .contains("FluentCI Studio")
    );
    desktop.stop().await;
    assert!(client.get(desktop_url).send().await.is_err());
    assert_eq!(
        count_projects(&client, &format!("http://{studio_address}")).await?,
        1
    );
    studio.abort();
    Ok(())
}

#[tokio::test]
async fn opening_a_nested_folder_registers_the_workspace_root_and_actions() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let backend = DesktopBackend::start(&temp.path().join("app.db")).await?;
    let root = temp.path().join("workspace");
    let nested = root.join("src/nested");
    std::fs::create_dir_all(&nested)?;
    std::fs::write(
        root.join("fluentci.toml"),
        "[[steps]]\nname='Hello'\ncommand='echo hello'\n",
    )?;
    let project = open_project(&backend.state, &nested).await?;
    assert_eq!(std::path::Path::new(&project.path), root.canonicalize()?);
    assert_eq!(backend.state.db.actions(&project.id).await?.len(), 1);
    backend.stop().await;
    Ok(())
}

#[test]
fn pipeline_worker_mode_runs_without_starting_the_desktop() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let module = temp.path().join("plugin.wasm");
    std::fs::write(
        &module,
        wat::parse_str(
            r#"(module (memory (export "memory") 1) (func (export "hello") (result i32) i32.const 0))"#,
        )?,
    )?;
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_fluentci-desktop"))
        .args(["__engine-call", "--module"])
        .arg(module)
        .args(["--", "hello"])
        .env("FLUENTCI_DATABASE", temp.path().join("unused.db"))
        .output()?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        !temp.path().join("unused.db").exists(),
        "Workers must not open the desktop database"
    );
    Ok(())
}

#[tokio::test]
async fn quitting_cancels_desktop_runs_without_cancelling_a_cli_run() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let backend = DesktopBackend::start(&temp.path().join("app.db")).await?;
    let project = open_project(&backend.state, temp.path()).await?;
    backend
        .state
        .db
        .save_actions(
            &project.id,
            &[fluentci::models::Action {
                name: "Long task".into(),
                plugin: "shell".into(),
                commands: "echo ready; sleep 30".into(),
                enabled: true,
                ..Default::default()
            }],
        )
        .await?;
    let foreign = fluentci::executor::prepare(&backend.state.db, &project).await?;
    let db = backend.state.db.clone();
    let result: Value = reqwest::Client::new().post(format!("{}/graphql", backend.url()))
        .json(&json!({"query":"mutation($id: ID!) { runPipeline(projectId: $id) { id } }", "variables": {"id":project.id}}))
        .send().await?.json().await?;
    let id = result["data"]["runPipeline"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            if db.run(&id).await.unwrap().is_some_and(|run| {
                run.jobs
                    .iter()
                    .any(|job| job.logs.as_ref().is_some_and(|logs| !logs.is_empty()))
            }) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await?;
    backend.stop().await;
    assert_eq!(
        db.run(&id).await?.unwrap().status.as_deref(),
        Some("CANCELLED")
    );
    assert_eq!(
        db.run(&foreign.id).await?.unwrap().status.as_deref(),
        Some("PENDING")
    );
    Ok(())
}
