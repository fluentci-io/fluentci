use fluentci::{
    db::Db,
    models::{Action, Project},
    project_git,
    server::{self, AppState},
};
use std::{path::Path, process::Command};

fn git(root: &Path, args: &[&str]) -> anyhow::Result<String> {
    let output = Command::new("git")
        .args([
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
        ])
        .args(args)
        .current_dir(root)
        .output()?;
    anyhow::ensure!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(String::from_utf8(output.stdout)?.trim().into())
}

fn repo(root: &Path) -> anyhow::Result<()> {
    git(root, &["init", "-b", "main"])?;
    std::fs::write(root.join("hello"), "main")?;
    git(root, &["add", "hello"])?;
    git(root, &["commit", "-m", "initial"])?;
    Ok(())
}

#[tokio::test]
async fn branch_controls_handle_nonrepos_detached_heads_and_protect_local_changes()
-> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    assert!(project_git::status(temp.path()).await?.is_none());
    repo(temp.path())?;
    git(temp.path(), &["switch", "-c", "feature/docs"])?;
    std::fs::write(temp.path().join("hello"), "feature")?;
    git(temp.path(), &["commit", "-am", "feature"])?;
    git(temp.path(), &["switch", "main"])?;
    let status = project_git::status(temp.path()).await?.unwrap();
    assert_eq!(status.branch.as_deref(), Some("main"));
    assert!(status.branches.contains(&"feature/docs".into()));
    assert!(!status.dirty);
    assert!(
        project_git::update(temp.path(), Some("--detach"))
            .await
            .is_err()
    );
    std::fs::write(temp.path().join("hello"), "local work")?;
    assert!(
        project_git::update(temp.path(), Some("feature/docs"))
            .await
            .is_err()
    );
    assert_eq!(
        std::fs::read_to_string(temp.path().join("hello"))?,
        "local work"
    );
    assert_eq!(
        project_git::status(temp.path())
            .await?
            .unwrap()
            .branch
            .as_deref(),
        Some("main")
    );
    git(temp.path(), &["restore", "hello"])?;
    assert_eq!(
        project_git::update(temp.path(), Some("feature/docs"))
            .await?
            .branch
            .as_deref(),
        Some("feature/docs")
    );
    git(temp.path(), &["switch", "--detach"])?;
    let detached = project_git::status(temp.path()).await?.unwrap();
    assert!(detached.branch.is_none() && detached.commit.is_some());
    assert!(project_git::update(temp.path(), None).await.is_err());
    Ok(())
}

#[tokio::test]
async fn pull_updates_from_a_local_remote_and_rejects_divergence() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    let seed = temp.path().join("seed");
    std::fs::create_dir(&seed)?;
    repo(&seed)?;
    git(temp.path(), &["clone", "--bare", "seed", "remote"])?;
    git(temp.path(), &["clone", "remote", "checkout"])?;
    git(&seed, &["remote", "add", "origin", "../remote"])?;
    let checkout = temp.path().join("checkout");
    std::fs::write(seed.join("hello"), "remote update")?;
    git(&seed, &["commit", "-am", "remote"])?;
    git(&seed, &["push", "origin", "main"])?;
    project_git::update(&checkout, None).await?;
    assert_eq!(
        std::fs::read_to_string(checkout.join("hello"))?,
        "remote update"
    );
    std::fs::write(checkout.join("local"), "local commit")?;
    git(&checkout, &["add", "local"])?;
    git(&checkout, &["commit", "-m", "local"])?;
    let before = git(&checkout, &["rev-parse", "HEAD"])?;
    std::fs::write(seed.join("hello"), "remote again")?;
    git(&seed, &["commit", "-am", "remote again"])?;
    git(&seed, &["push", "origin", "main"])?;
    assert!(project_git::update(&checkout, None).await.is_err());
    assert_eq!(git(&checkout, &["rev-parse", "HEAD"])?, before);
    Ok(())
}

#[tokio::test]
async fn graphql_git_controls_reject_archived_projects_and_active_runs() -> anyhow::Result<()> {
    let temp = tempfile::tempdir()?;
    repo(temp.path())?;
    git(temp.path(), &["branch", "feature"])?;
    let db = Db::open(&temp.path().join("studio.sqlite")).await?;
    let mut project = Project::new(temp.path().to_string_lossy().into());
    db.save_project(&project).await?;
    let schema = server::schema(AppState::new(db.clone()));
    let request = || {
        async_graphql::Request::new(
            "mutation($id:ID!){switchProjectBranch(projectId:$id,branch:\"feature\"){branch}}",
        )
        .variables(async_graphql::Variables::from_json(
            serde_json::json!({"id":project.id}),
        ))
    };
    let response = schema.execute(request()).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(
        response.data.into_json()?["switchProjectBranch"]["branch"],
        "feature"
    );
    db.save_actions(
        &project.id,
        &[Action {
            name: "test".into(),
            plugin: "shell".into(),
            commands: "true".into(),
            enabled: true,
            ..Default::default()
        }],
    )
    .await?;
    fluentci::executor::prepare(&db, &project).await?;
    assert!(
        schema
            .execute(request())
            .await
            .errors
            .iter()
            .any(|e| e.message.contains("active project runs"))
    );
    project.archived = Some(true);
    db.save_project(&project).await?;
    assert!(
        schema
            .execute(request())
            .await
            .errors
            .iter()
            .any(|e| e.message.contains("archived"))
    );
    Ok(())
}
