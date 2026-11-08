//! Shared metadata/transfer guards and bounded network scheduling.

use crate::file_guard::FileGuard;
use anyhow::{Context, Result, ensure};
use futures_util::{StreamExt, TryStreamExt, stream};
use std::{
    future::Future,
    io::Write,
    path::{Path, PathBuf},
};

pub(crate) fn jobs() -> Result<usize> {
    let value = std::env::var("FLUENTCI_DEPENDENCY_JOBS").unwrap_or_else(|_| "8".into());
    let jobs: usize = value
        .parse()
        .context("FLUENTCI_DEPENDENCY_JOBS must be an integer from 1 to 64")?;
    ensure!(
        (1..=64).contains(&jobs),
        "FLUENTCI_DEPENDENCY_JOBS must be from 1 to 64"
    );
    Ok(jobs)
}

pub(crate) fn directory() -> Result<PathBuf> {
    Ok(dirs::cache_dir()
        .context("Cache directory unavailable")?
        .join("fluentci/dependencies"))
}

pub(crate) async fn guard(namespace: &str, key: &str) -> Result<FileGuard> {
    let directory = directory()?.join("guards");
    tokio::fs::create_dir_all(&directory).await?;
    FileGuard::acquire(directory.join(format!("{}-{}.guard", namespace, sha256::digest(key)))).await
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let directory = path.parent().context("Cache entry has no parent")?;
    std::fs::create_dir_all(directory)?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary.persist(path)?;
    Ok(())
}

pub(crate) async fn parallel<F, T>(tasks: impl IntoIterator<Item = F>) -> Result<Vec<T>>
where
    F: Future<Output = Result<T>>,
{
    parallel_with_limit(tasks, jobs()?).await
}

async fn parallel_with_limit<F, T>(
    tasks: impl IntoIterator<Item = F>,
    limit: usize,
) -> Result<Vec<T>>
where
    F: Future<Output = Result<T>>,
{
    stream::iter(tasks)
        .buffer_unordered(limit)
        .try_collect()
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn independent_requests_overlap_with_a_bounded_limit() -> Result<()> {
        let active = AtomicUsize::new(0);
        let peak = AtomicUsize::new(0);
        let tasks = (0..20).map(|index| {
            let active = &active;
            let peak = &peak;
            async move {
                let count = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(count, Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                active.fetch_sub(1, Ordering::SeqCst);
                Ok(index)
            }
        });
        let mut results = parallel_with_limit(tasks, 3).await?;
        results.sort();
        assert_eq!(results, (0..20).collect::<Vec<_>>());
        assert_eq!(peak.load(Ordering::SeqCst), 3);
        assert_eq!(active.load(Ordering::SeqCst), 0);
        Ok(())
    }

    #[tokio::test]
    async fn failed_batch_drops_other_operations_and_their_guards() -> Result<()> {
        let root = tempfile::tempdir()?;
        let ready = tokio::sync::Barrier::new(3);
        let tasks = (0..3).map(|index| {
            let ready = &ready;
            let path = root.path().join(format!("{index}.guard"));
            async move {
                let _guard = FileGuard::acquire(path).await?;
                ready.wait().await;
                if index == 0 {
                    anyhow::bail!("transfer failed");
                }
                std::future::pending::<()>().await;
                Ok(())
            }
        });
        assert!(parallel_with_limit(tasks, 3).await.is_err());
        assert_eq!(std::fs::read_dir(root.path())?.count(), 0);
        Ok(())
    }
}
