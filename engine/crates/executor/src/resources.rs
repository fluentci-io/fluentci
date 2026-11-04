//! Advisory, process-shared resource leases. Files stay in place: unlinking a
//! lock inode while another process uses it would split the coordination domain.
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
};

pub(crate) struct Leases {
    _files: Vec<Lock>,
}
// Closing one descriptor does not release flock while a duplicate (including a
// concurrent fork's pre-exec descriptor) still references the open file. Release
// explicitly when the owning lease ends, before closing its descriptor.
pub(crate) struct Lock(File);
impl Lock {
    pub(crate) fn new(file: File) -> Self {
        Self(file)
    }
}
impl Drop for Lock {
    fn drop(&mut self) {
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            loop {
                if unsafe { libc::flock(self.0.as_raw_fd(), libc::LOCK_UN) } == 0 {
                    break;
                }
                if std::io::Error::last_os_error().kind() != std::io::ErrorKind::Interrupted {
                    break;
                }
            }
        }
    }
}
pub(crate) enum Attempt {
    Acquired(Leases),
    Busy(String),
}
pub(crate) fn directory(configured: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = configured {
        return Ok(path.to_path_buf());
    }
    std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join(".cache/fluentci/resources"))
        .ok_or_else(|| "set resource_dir when HOME is unavailable".into())
}
pub(crate) fn initialize(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err("resource_dir must be absolute".into());
    }
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path).map_err(|e| e.to_string())?;
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_dir() {
        return Err("resource_dir must be a real directory".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != unsafe { libc::geteuid() } || metadata.mode() & 0o077 != 0 {
            return Err("resource_dir must be owned by this user with mode 0700".into());
        }
    }
    Ok(())
}
// Shared by named resource leases and content-addressed action locks. Reject
// symlinks and nonregular files; nonblocking opens prevent FIFO substitutions
// from stalling before the regular-file check and advisory locking.
pub(crate) fn open_lock_file(path: &Path) -> Result<File, String> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options.open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("coordination lock is not a regular file".into());
    }
    Ok(file)
}
pub(crate) fn acquire(root: &Path, names: &[String], shared: &[String]) -> Result<Attempt, String> {
    let mut modes = BTreeMap::new();
    for name in shared {
        modes.insert(name, false);
    }
    for name in names {
        modes.insert(name, true);
    }
    let mut files = Vec::new();
    for (name, exclusive) in modes {
        let path = root.join(hex::encode(Sha256::digest(name.as_bytes())));
        let file = open_lock_file(&path)?;
        #[cfg(unix)]
        {
            use std::os::fd::AsRawFd;
            if unsafe {
                libc::flock(
                    file.as_raw_fd(),
                    (if exclusive {
                        libc::LOCK_EX
                    } else {
                        libc::LOCK_SH
                    }) | libc::LOCK_NB,
                )
            } != 0
            {
                let error = std::io::Error::last_os_error();
                if error.kind() == std::io::ErrorKind::WouldBlock {
                    return Ok(Attempt::Busy(name.clone()));
                }
                return Err(error.to_string());
            }
        }
        #[cfg(not(unix))]
        {
            return Err("cross-run resource leases require Unix".into());
        }
        files.push(Lock::new(file));
    }
    Ok(Attempt::Acquired(Leases { _files: files }))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn dropping_a_lease_unlocks_even_with_a_duplicate_descriptor() {
        let root = tempfile::tempdir().unwrap();
        let names = ["workspace".into()];
        let Attempt::Acquired(owner) = acquire(root.path(), &names, &[]).unwrap() else {
            panic!("initial lease must be available");
        };
        let duplicate = owner._files[0].0.try_clone().unwrap();
        assert!(matches!(
            acquire(root.path(), &names, &[]).unwrap(),
            Attempt::Busy(_)
        ));
        drop(owner);
        let Attempt::Acquired(next) = acquire(root.path(), &names, &[]).unwrap() else {
            panic!("duplicate descriptor must not extend the completed lease");
        };
        // Closing a stale duplicate must not release the next owner's lock.
        drop(duplicate);
        assert!(matches!(
            acquire(root.path(), &names, &[]).unwrap(),
            Attempt::Busy(_)
        ));
        drop(next);
        assert!(matches!(
            acquire(root.path(), &names, &[]).unwrap(),
            Attempt::Acquired(_)
        ));
    }

    #[test]
    fn a_busy_resource_releases_the_partially_acquired_set() {
        let root = tempfile::tempdir().unwrap();
        let Attempt::Acquired(blocker) = acquire(root.path(), &["b".into()], &[]).unwrap() else {
            panic!("initial lease must be available");
        };
        assert!(matches!(
            acquire(root.path(), &["a".into(), "b".into()], &[]).unwrap(),
            Attempt::Busy(_)
        ));
        assert!(matches!(
            acquire(root.path(), &["a".into()], &[]).unwrap(),
            Attempt::Acquired(_)
        ));
        drop(blocker);
    }
}
