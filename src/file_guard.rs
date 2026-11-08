//! Advisory locks with safe unlink-on-release, including already-open waiters.

use anyhow::{Context, Result, ensure};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

pub(crate) struct FileGuard {
    file: File,
    path: PathBuf,
    token: String,
}

fn open(path: &Path, write: bool) -> std::io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(write)
        .create(write)
        .truncate(false);
    #[cfg(unix)]
    options
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    options.open(path)
}

fn owns(path: &Path, token: &str) -> bool {
    let Ok(file) = open(path, false) else {
        return false;
    };
    if !file.metadata().is_ok_and(|metadata| metadata.is_file()) {
        return false;
    }
    let mut current = String::new();
    file.take(128).read_to_string(&mut current).is_ok() && current == token
}

impl FileGuard {
    pub(crate) fn lock(path: &Path) -> Result<Self> {
        loop {
            let mut file =
                open(path, true).with_context(|| format!("Opening guard {}", path.display()))?;
            ensure!(file.metadata()?.is_file(), "Guard must be a regular file");
            file.lock()?;
            let token = uuid::Uuid::new_v4().to_string();
            file.set_len(0)?;
            file.seek(SeekFrom::Start(0))?;
            file.write_all(token.as_bytes())?;
            file.flush()?;
            // A previous owner can unlink while this waiter is blocked on its
            // old inode. Claim only the current pathname, otherwise reopen.
            if owns(path, &token) {
                return Ok(Self {
                    file,
                    path: path.to_owned(),
                    token,
                });
            }
        }
    }

    pub(crate) async fn acquire(path: PathBuf) -> Result<Self> {
        tokio::task::spawn_blocking(move || Self::lock(&path)).await?
    }
}

impl Drop for FileGuard {
    fn drop(&mut self) {
        // Still hold the advisory lock while unlinking. Old-inode waiters verify
        // the claim above; none can enter alongside the next pathname owner.
        if owns(&self.path, &self.token) {
            let _ = std::fs::remove_file(&self.path);
        }
        let _ = self.file.unlock();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn guards_clean_up_and_recover_stale_files() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("test.guard");
        std::fs::write(&path, "stale")?;
        {
            let _guard = FileGuard::lock(&path)?;
            assert!(path.is_file());
        }
        assert!(!path.exists());
        Ok(())
    }

    #[test]
    fn unlinking_never_admits_waiters_on_obsolete_inodes() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("contended.guard");
        let active = AtomicUsize::new(0);
        std::thread::scope(|scope| {
            for _ in 0..8 {
                scope.spawn(|| {
                    for _ in 0..40 {
                        let _guard = FileGuard::lock(&path).unwrap();
                        assert_eq!(active.fetch_add(1, Ordering::SeqCst), 0);
                        std::thread::yield_now();
                        assert_eq!(active.fetch_sub(1, Ordering::SeqCst), 1);
                    }
                });
            }
        });
        assert!(!path.exists());
        Ok(())
    }
}
