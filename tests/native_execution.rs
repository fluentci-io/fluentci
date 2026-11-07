use anyhow::Result;
use fluentci_engine::cmd::execute::{Options, execute_with_options};
use serde_json::json;
use std::fs;

#[tokio::test]
async fn dry_run_validates_without_running_tasks_or_creating_runtime_storage() -> Result<()> {
    let root = tempfile::tempdir()?;
    let path = root.path().join("plan.json");
    fs::write(
        &path,
        serde_json::to_vec(&json!({
            "inherit_env":false,"cache_dir":"cache","resource_dir":"resources",
            "tasks":[{"id":"effect","cwd":".","program":"/bin/sh",
                "args":["-c","touch forbidden"],"resources":["test-lock"]}]
        }))?,
    )?;
    execute_with_options(
        path.to_str().unwrap(),
        None,
        "plain",
        Options {
            dry_run: true,
            ..Default::default()
        },
    )
    .await?;
    for name in [
        "forbidden",
        "cache",
        "resources",
        "events.jsonl",
        "result.json",
    ] {
        assert!(!root.path().join(name).exists(), "dry run created {name}");
    }
    assert_eq!(fs::read_dir(root.path())?.count(), 1);
    fs::write(
        &path,
        serde_json::to_vec(&json!({
            "tasks":[{"id":"invalid","cwd":".","program":"/bin/sh","needs":["missing"]}]
        }))?,
    )?;
    assert!(
        execute_with_options(
            path.to_str().unwrap(),
            None,
            "plain",
            Options {
                dry_run: true,
                ..Default::default()
            }
        )
        .await
        .is_err()
    );
    assert_eq!(fs::read_dir(root.path())?.count(), 1);
    Ok(())
}
