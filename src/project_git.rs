//! Git controls for Studio projects. Commands never use a shell or force changes.

use anyhow::{Context, Result, ensure};
use async_graphql::SimpleObject;
use std::{
    path::Path,
    process::{Output, Stdio},
    time::Duration,
};
use tokio::{process::Command, sync::Mutex};

static MUTATIONS: Mutex<()> = Mutex::const_new(());

#[derive(Debug, SimpleObject)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub branches: Vec<String>,
    pub upstream: Option<String>,
    pub dirty: bool,
}

async fn command(root: &Path, args: &[&str]) -> Result<Output> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .kill_on_drop(true);
    tokio::time::timeout(Duration::from_secs(120), command.output())
        .await
        .context("Git operation timed out")?
        .context("Could not run Git")
}

fn text(output: Output) -> Option<String> {
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|value| !value.is_empty())
}

pub async fn status(root: &Path) -> Result<Option<GitStatus>> {
    if !root.is_dir() {
        return Ok(None);
    }
    let probe = command(root, &["rev-parse", "--is-inside-work-tree"]).await?;
    if text(probe).as_deref() != Some("true") {
        return Ok(None);
    }
    let branch = text(command(root, &["symbolic-ref", "--quiet", "--short", "HEAD"]).await?);
    let commit = text(command(root, &["rev-parse", "--verify", "--short", "HEAD"]).await?);
    let output = command(
        root,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
    )
    .await?;
    ensure!(output.status.success(), "Could not list Git branches");
    let mut branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::to_owned)
        .collect();
    if let Some(branch) = &branch
        && !branches.contains(branch)
    {
        branches.insert(0, branch.clone());
    }
    let upstream = if branch.is_some() {
        text(
            command(
                root,
                &[
                    "rev-parse",
                    "--abbrev-ref",
                    "--symbolic-full-name",
                    "@{upstream}",
                ],
            )
            .await?,
        )
    } else {
        None
    };
    let output = command(root, &["status", "--porcelain", "--untracked-files=normal"]).await?;
    ensure!(
        output.status.success(),
        "Could not read Git working tree status"
    );
    Ok(Some(GitStatus {
        branch,
        commit,
        branches,
        upstream,
        dirty: !output.stdout.is_empty(),
    }))
}

pub async fn update(root: &Path, branch: Option<&str>) -> Result<GitStatus> {
    let _guard = MUTATIONS.lock().await;
    let before = status(root)
        .await?
        .context("Project is not a Git working tree")?;
    let args = if let Some(branch) = branch {
        ensure!(
            !branch.starts_with('-') && before.branches.iter().any(|name| name == branch),
            "Select an existing local Git branch"
        );
        vec!["switch", "--no-guess", branch]
    } else {
        ensure!(before.branch.is_some(), "Switch to a branch before pulling");
        ensure!(
            before.upstream.is_some(),
            "This branch has no upstream configured"
        );
        vec!["pull", "--ff-only", "--no-rebase"]
    };
    let output = command(root, &args).await?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        // Git can include credential-bearing remote URLs in diagnostics.
        let error = error
            .split_whitespace()
            .map(|word| {
                if word.contains("://") {
                    "[remote]"
                } else {
                    word
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        anyhow::bail!(
            "Git {} failed: {}",
            args[0],
            error.chars().take(1500).collect::<String>()
        );
    }
    status(root)
        .await?
        .context("Git working tree is no longer available")
}
