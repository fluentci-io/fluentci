//! Content-addressed Git checkouts shared by builds and README rendering.

use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::process::Command;

async fn git(directory: &Path, arguments: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(arguments)
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true)
        .output()
        .await
        .context("Starting git")?;
    anyhow::ensure!(
        output.status.success(),
        "Git operation failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    );
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}

fn commit(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub async fn checkout(url: &str, revision: &str) -> Result<(String, PathBuf)> {
    let cache = std::env::var_os("FLUENTCI_GIT_CACHE")
        .map(PathBuf::from)
        .or_else(|| dirs::cache_dir().map(|path| path.join("fluentci/git")))
        .context("Git cache directory unavailable")?;
    checkout_at(url, revision, &cache).await
}

async fn checkout_at(url: &str, revision: &str, cache_root: &Path) -> Result<(String, PathBuf)> {
    let cache = cache_root.join(sha256::digest(url));
    tokio::fs::create_dir_all(&cache).await?;
    let _guard =
        crate::dependency_cache::guard("git", &format!("{}#{revision}", cache.display())).await?;
    if commit(revision) {
        let directory = cache.join(revision);
        if directory.is_dir() {
            anyhow::ensure!(
                git(&directory, &["rev-parse", "HEAD"]).await? == revision,
                "Cached Git checkout does not match locked commit"
            );
            git(&directory, &["diff", "--quiet", "HEAD", "--"])
                .await
                .context("Cached Git source has tracked changes")?;
            return Ok((revision.into(), directory));
        }
    }
    let temporary = tempfile::tempdir_in(&cache)?;
    git(temporary.path(), &["init", "--quiet"]).await?;
    git(
        temporary.path(),
        &["fetch", "--quiet", "--depth=1", "--", url, revision],
    )
    .await?;
    git(
        temporary.path(),
        &[
            "-c",
            "advice.detachedHead=false",
            "checkout",
            "--quiet",
            "--detach",
            "FETCH_HEAD",
        ],
    )
    .await?;
    let resolved = git(temporary.path(), &["rev-parse", "HEAD"]).await?;
    anyhow::ensure!(commit(&resolved), "Git returned an invalid commit");
    if commit(revision) {
        anyhow::ensure!(
            resolved == revision,
            "Git revision does not match locked commit"
        );
    }
    let destination = cache.join(&resolved);
    if !destination.is_dir() {
        match std::fs::rename(temporary.path(), &destination) {
            Ok(()) => {}
            Err(_) if destination.is_dir() => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok((resolved, destination))
}

pub fn subdirectory(root: &Path, subdir: Option<&Path>) -> Result<PathBuf> {
    if let Some(subdir) = subdir {
        crate::config::validate_subdir(subdir)?;
    }
    let root = root.canonicalize()?;
    let directory = root
        .join(subdir.unwrap_or(Path::new(".")))
        .canonicalize()
        .context("Git module subdir does not exist")?;
    anyhow::ensure!(
        directory.is_dir() && directory.starts_with(&root),
        "subdir must stay inside the Git repository"
    );
    Ok(directory)
}

pub async fn readme(
    url: &str,
    subdir: Option<&Path>,
    revision: Option<&str>,
) -> Result<Option<PathBuf>> {
    crate::config::validate_repository(url)?;
    let (_, root) = checkout(url, revision.unwrap_or("HEAD")).await?;
    let directory = subdirectory(&root, subdir)?;
    let readme = directory.join("README.md");
    if !readme.is_file() {
        return Ok(None);
    }
    let readme = readme.canonicalize()?;
    anyhow::ensure!(
        readme.starts_with(root.canonicalize()?),
        "README must stay inside the Git repository"
    );
    Ok(Some(readme))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn locked_commits_keep_the_original_monorepo_readme() -> Result<()> {
        let root = tempfile::tempdir()?;
        let repository = root.path().join("source");
        std::fs::create_dir(&repository)?;
        git(&repository, &["init", "--quiet"]).await?;
        git(&repository, &["config", "user.name", "Test"]).await?;
        git(&repository, &["config", "user.email", "test@example.com"]).await?;
        std::fs::create_dir_all(repository.join("modules/cache"))?;
        std::fs::write(repository.join("modules/cache/README.md"), "First release")?;
        git(&repository, &["add", "."]).await?;
        git(
            &repository,
            &[
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "first",
            ],
        )
        .await?;
        let url = reqwest::Url::from_directory_path(&repository)
            .unwrap()
            .to_string();
        let cache = root.path().join("checkouts");
        let (first, checkout) = checkout_at(&url, "HEAD", &cache).await?;
        let directory = subdirectory(&checkout, Some(Path::new("modules/cache")))?;
        assert_eq!(
            std::fs::read_to_string(directory.join("README.md"))?,
            "First release"
        );
        std::fs::write(repository.join("modules/cache/README.md"), "Second release")?;
        git(&repository, &["add", "."]).await?;
        git(
            &repository,
            &[
                "-c",
                "commit.gpgsign=false",
                "commit",
                "--quiet",
                "-m",
                "second",
            ],
        )
        .await?;
        let (locked, _) = checkout_at(&url, &first, &cache).await?;
        assert_eq!(locked, first);
        let (latest, _) = checkout_at(&url, "HEAD", &cache).await?;
        assert_ne!(latest, first);
        Ok(())
    }

    #[test]
    fn subdirectories_cannot_escape_the_repository() -> Result<()> {
        let root = tempfile::tempdir()?;
        std::fs::create_dir(root.path().join("module"))?;
        assert!(subdirectory(root.path(), Some(Path::new("module")))?.ends_with("module"));
        assert!(subdirectory(root.path(), Some(Path::new("../"))).is_err());
        assert!(subdirectory(root.path(), Some(Path::new("/tmp"))).is_err());
        Ok(())
    }
}
