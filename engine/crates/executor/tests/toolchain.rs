#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan};
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    path::Path,
};

fn plan(root: &Path, files: &[&Path]) -> Plan {
    serde_json::from_value(serde_json::json!({
        "inherit_env": false, "cache_dir": root.join("cache"),
        "tasks": [{"id": "build", "program": "/bin/sh", "cwd": root,
        "args": ["-c", "printf output > output"],
        "cache": {"inputs": [], "outputs": ["output"], "toolchain": "fixture", "toolchain_files": files}}]
    })).unwrap()
}

#[test]
fn external_files_invalidate_on_content_modes_and_link_targets() {
    let root = tempfile::tempdir().unwrap();
    let tools = tempfile::tempdir().unwrap();
    let file = tools.path().join("tool");
    let link = tools.path().join("link");
    fs::write(&file, "version-one").unwrap();
    symlink(&file, &link).unwrap();
    let mut p = plan(root.path(), &[&link, &file, &link]);
    let mut previous = None;
    for (i, expected) in ["stored", "hit", "stored", "stored", "stored"]
        .iter()
        .enumerate()
    {
        match i {
            1 => {
                p.tasks[0].cache.as_mut().unwrap().toolchain_files =
                    vec![file.clone(), link.clone()]
            }
            2 => fs::write(&file, "version-two").unwrap(),
            3 => fs::set_permissions(&file, fs::Permissions::from_mode(0o700)).unwrap(),
            4 => {
                let other = tools.path().join("other");
                fs::write(&other, "version-three").unwrap();
                fs::remove_file(&link).unwrap();
                symlink(other, &link).unwrap();
            }
            _ => (),
        }
        let result = p
            .execute(
                &root.path().join(format!("run-{i}")),
                &Cancellation::default(),
            )
            .unwrap();
        assert!(result.success(), "{result:?}");
        let cache = &result.tasks[0].cache;
        assert_eq!(cache.outcome, *expected);
        let digest = &cache.components["toolchain_files"];
        if i == 1 {
            assert_eq!(previous.as_ref(), Some(digest));
        }
        if i > 1 {
            assert_ne!(previous.as_ref(), Some(digest));
        }
        previous = Some(digest.clone());
    }
}

#[test]
fn changed_toolchain_does_not_publish_and_bad_paths_fail_before_commands() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("tool");
    fs::write(&file, "original").unwrap();
    let mut p = plan(root.path(), &[&file]);
    p.tasks[0].args[1] = "printf changed > tool; printf output > output".into();
    let result = p
        .execute(&root.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(!result.success(), "{result:?}");
    assert_ne!(result.tasks[0].cache.outcome, "stored");
    assert!(result.tasks[0]
        .cache
        .reason
        .contains("toolchain files changed"));
    assert_eq!(
        fs::read_dir(root.path().join("cache/actions"))
            .unwrap()
            .count(),
        0
    );
    for invalid in [Path::new("relative"), Path::new("/tmp/../tool")] {
        assert!(plan(root.path(), &[invalid]).validate().is_err());
    }
    let overlap = plan(root.path(), &[&root.path().join("output")]);
    assert!(overlap
        .execute(&root.path().join("overlap"), &Cancellation::default())
        .unwrap_err()
        .contains("overlap"));
    let fifo = root.path().join("fifo");
    let path = std::ffi::CString::new(fifo.as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
    let bad = plan(root.path(), &[&fifo]);
    let result = bad
        .execute(&root.path().join("fifo-run"), &Cancellation::default())
        .unwrap();
    assert!(!result.success());
    assert!(result.tasks[0]
        .error
        .as_ref()
        .unwrap()
        .contains("not a regular file"));
}

#[test]
fn toolchain_readers_require_ordering_with_declared_writers() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("tool");
    fs::write(&file, "original").unwrap();
    let mut p = plan(root.path(), &[&file]);
    let mut writer = p.tasks[0].clone();
    writer.id = "writer".into();
    writer.cache.as_mut().unwrap().toolchain_files.clear();
    writer.cache.as_mut().unwrap().outputs = vec!["tool".into()];
    writer.args[1] = "printf changed > tool".into();
    p.tasks.push(writer);
    assert!(p
        .execute(&root.path().join("unordered"), &Cancellation::default())
        .unwrap_err()
        .contains("unordered"));
    p.tasks[0].needs.push("writer".into());
    let result = p
        .execute(&root.path().join("ordered"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
}
