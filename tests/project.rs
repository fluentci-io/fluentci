use fluentci::db::Db;
use std::process::Command;

#[tokio::test]
async fn creating_a_project_persists_it_for_later_commands() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let database = temp.path().join("db");
    let output = Command::new(env!("CARGO_BIN_EXE_fluentci"))
        .args(["--check-update=false", "--database"])
        .arg(&database)
        .args(["project", "create"])
        .current_dir(temp.path())
        .output()?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let db = Db::open(&database).await?;
    let projects = db.projects().await?;
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].path, "empty");
    assert!(String::from_utf8(output.stdout)?.contains(&projects[0].name));
    Ok(())
}
