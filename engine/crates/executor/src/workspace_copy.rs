//! Private workspace materialization: prefer COW, never hard-link writable inputs.
use crate::Cancellation;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::Path,
};

fn check_cancel(cancel: &Cancellation) -> Result<(), String> {
    if cancel.is_cancelled() {
        Err("workspace setup cancelled".into())
    } else {
        Ok(())
    }
}

pub(crate) fn copy(source: &Path, target: &Path, cancel: &Cancellation) -> Result<bool, String> {
    copy_with(source, target, cancel, try_clone)
}

fn copy_with(
    source: &Path,
    target: &Path,
    cancel: &Cancellation,
    clone: impl FnOnce(&File, &Path) -> io::Result<bool>,
) -> Result<bool, String> {
    check_cancel(cancel)?;
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut input = options.open(source).map_err(|e| e.to_string())?;
    let metadata = input.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("workspace input is not a regular file".into());
    }
    let cloned = clone(&input, target).map_err(|e| e.to_string())?;
    check_cancel(cancel)?;
    if !cloned {
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(|e| e.to_string())?;
        let mut buffer = [0u8; 65536];
        loop {
            check_cancel(cancel)?;
            let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            output
                .write_all(&buffer[..count])
                .map_err(|e| e.to_string())?;
        }
    }
    check_cancel(cancel)?;
    fs::set_permissions(target, metadata.permissions()).map_err(|e| e.to_string())?;
    Ok(cloned)
}

// Clone failures leave no destination. Unsupported/cross-device clones fall back
// to the cancellable stream. Other I/O errors remain errors, never silent success.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn unsupported(error: &io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(
            libc::EXDEV | libc::ENOTSUP | libc::ENOSYS | libc::EINVAL | libc::ENOTTY | libc::EPERM
        )
    )
}

#[cfg(target_os = "macos")]
fn try_clone(source: &File, target: &Path) -> io::Result<bool> {
    use std::{
        ffi::CString,
        os::{fd::AsRawFd, unix::ffi::OsStrExt},
    };
    // clonefile copies xattrs and flags; the streaming workspace contract does
    // not. Fall back for user metadata. macOS adds provenance even to new
    // streamed files, so that OS-maintained attribute alone is allowed.
    let mut stat: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstat(source.as_raw_fd(), &mut stat) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if stat.st_flags != 0 {
        return Ok(false);
    }
    let size = unsafe { libc::flistxattr(source.as_raw_fd(), std::ptr::null_mut(), 0, 0) };
    if !(0..=65536).contains(&size) {
        return Ok(false);
    }
    if size > 0 {
        let mut names = vec![0u8; size as usize];
        let count = unsafe {
            libc::flistxattr(
                source.as_raw_fd(),
                names.as_mut_ptr().cast(),
                names.len(),
                0,
            )
        };
        if count < 0 || count as usize > names.len() {
            return Ok(false);
        }
        if names[..count as usize]
            .split(|byte| *byte == 0)
            .any(|name| !name.is_empty() && name != b"com.apple.provenance")
        {
            return Ok(false);
        }
    }
    let target = CString::new(target.as_os_str().as_bytes())?;
    // CLONE_NOOWNERCOPY (sys/clonefile.h): match newly created file ownership.
    if unsafe { libc::fclonefileat(source.as_raw_fd(), libc::AT_FDCWD, target.as_ptr(), 0x0002) }
        == 0
    {
        Ok(true)
    } else {
        let error = io::Error::last_os_error();
        if unsupported(&error) {
            Ok(false)
        } else {
            Err(error)
        }
    }
}

#[cfg(target_os = "linux")]
fn try_clone(source: &File, target: &Path) -> io::Result<bool> {
    use std::os::fd::AsRawFd;
    let output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)?;
    if unsafe { libc::ioctl(output.as_raw_fd(), libc::FICLONE, source.as_raw_fd()) } == 0 {
        return Ok(true);
    }
    let error = io::Error::last_os_error();
    drop(output);
    fs::remove_file(target)?;
    if unsupported(&error) {
        Ok(false)
    } else {
        Err(error)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn try_clone(_: &File, _: &Path) -> io::Result<bool> {
    Ok(false)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    #[test]
    fn native_and_fallback_copies_preserve_bytes_modes_and_independent_writes() {
        for native in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let source = root.path().join("source");
            let target = root.path().join("target");
            fs::write(&source, vec![42; 256 * 1024]).unwrap();
            fs::set_permissions(&source, fs::Permissions::from_mode(0o751)).unwrap();
            let cloned = copy_with(&source, &target, &Cancellation::default(), |file, path| {
                if native {
                    try_clone(file, path)
                } else {
                    Ok(false)
                }
            })
            .unwrap();
            if native && std::env::var("FLUENTCI_REQUIRE_WORKSPACE_CLONE").as_deref() == Ok("1") {
                assert!(cloned, "test filesystem must support cloning");
            }
            assert_eq!(fs::read(&source).unwrap(), fs::read(&target).unwrap());
            assert_eq!(fs::metadata(&target).unwrap().mode() & 0o777, 0o751);
            assert_ne!(
                fs::metadata(&source).unwrap().ino(),
                fs::metadata(&target).unwrap().ino()
            );
            fs::write(&target, b"target mutation").unwrap();
            assert_eq!(fs::read(&source).unwrap(), vec![42; 256 * 1024]);
            fs::write(&source, b"source mutation").unwrap();
            assert_eq!(fs::read(&target).unwrap(), b"target mutation");
            assert!(copy(&source, &target, &Cancellation::default()).is_err());
            assert_eq!(fs::read(&target).unwrap(), b"target mutation");
        }
    }

    #[test]
    fn cancellation_and_invalid_sources_do_not_create_outputs() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let target = root.path().join("target");
        fs::write(&source, b"content").unwrap();
        let cancel = Cancellation::default();
        cancel.cancel();
        assert!(copy(&source, &target, &cancel).is_err());
        assert!(!target.exists());
        let cancel = Cancellation::default();
        assert!(copy_with(&source, &target, &cancel, |_, _| {
            cancel.cancel();
            Ok(false)
        })
        .is_err());
        assert!(!target.exists());
        let link = root.path().join("link");
        std::os::unix::fs::symlink(&source, &link).unwrap();
        assert!(copy(&link, &target, &Cancellation::default()).is_err());
        assert!(copy(root.path(), &target, &Cancellation::default()).is_err());
        use std::os::unix::ffi::OsStrExt;
        let fifo = root.path().join("fifo");
        let name = std::ffi::CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        assert!(copy(&fifo, &target, &Cancellation::default()).is_err());
        assert!(!target.exists());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_metadata_uses_streaming_fallback() {
        use std::os::fd::AsRawFd;
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        fs::write(&source, b"content").unwrap();
        let file = File::open(&source).unwrap();
        let attribute = std::ffi::CString::new("user.fluentci-test").unwrap();
        assert_eq!(
            unsafe {
                libc::fsetxattr(
                    file.as_raw_fd(),
                    attribute.as_ptr(),
                    b"value".as_ptr().cast(),
                    5,
                    0,
                    0,
                )
            },
            0
        );
        let target = root.path().join("target");
        assert!(!copy(&source, &target, &Cancellation::default()).unwrap());
        assert_eq!(fs::read(&target).unwrap(), b"content");
        let output = File::open(&target).unwrap();
        assert_eq!(
            unsafe {
                libc::fgetxattr(
                    output.as_raw_fd(),
                    attribute.as_ptr(),
                    std::ptr::null_mut(),
                    0,
                    0,
                    0,
                )
            },
            -1
        );
        assert_eq!(
            io::Error::last_os_error().raw_os_error(),
            Some(libc::ENOATTR)
        );
        assert_eq!(
            unsafe { libc::fremovexattr(file.as_raw_fd(), attribute.as_ptr(), 0) },
            0
        );
        assert_eq!(
            unsafe { libc::fchflags(file.as_raw_fd(), libc::UF_NODUMP) },
            0
        );
        assert!(!copy(
            &source,
            &root.path().join("flagged"),
            &Cancellation::default()
        )
        .unwrap());
    }

    #[test]
    #[ignore = "release-only workspace copy benchmark; no timing threshold"]
    fn workspace_copy_benchmark() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let bytes = vec![42; 64 * 1024 * 1024];
        fs::write(&source, &bytes).unwrap();
        for native in [false, true] {
            for index in 0..5 {
                let target = root.path().join(format!("copy-{native}-{index}"));
                let started = std::time::Instant::now();
                let cloned = copy_with(&source, &target, &Cancellation::default(), |file, path| {
                    if native {
                        try_clone(file, path)
                    } else {
                        Ok(false)
                    }
                })
                .unwrap();
                let elapsed = started.elapsed();
                assert_eq!(fs::read(&target).unwrap(), bytes);
                eprintln!(
                    "workspace_copy native={native} cloned={cloned} seconds={:.6}",
                    elapsed.as_secs_f64()
                );
                fs::remove_file(target).unwrap();
            }
        }
    }
}
