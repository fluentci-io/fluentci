#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan};
use serde_json::json;
use std::{
    fs,
    os::unix::fs::{symlink, PermissionsExt},
    path::Path,
    thread,
};

fn plan(source: &Path) -> Plan {
    serde_json::from_value(json!({
        "workspace":{"source":source,"inputs":["input","script"]},
        "inherit_env":false,"jobs":2,
        "tasks":[
            {"id":"build","program":"./script","cwd":".","env":{"VALUE":"one"}},
            {"id":"read","program":"/bin/sh","args":["-c","/bin/cat input > consumed"],"cwd":".","needs":["build"]}
        ]
    })).unwrap()
}
fn source(root: &Path) -> std::path::PathBuf {
    let source = root.join("source");
    fs::create_dir(&source).unwrap();
    fs::write(source.join("input"), "original").unwrap();
    fs::write(source.join("unselected"), "private").unwrap();
    fs::write(
        source.join("script"),
        "#!/bin/sh\nprintf '%s' \"$VALUE\" > input; printf '%s' \"$VALUE\" > output\n",
    )
    .unwrap();
    fs::set_permissions(source.join("script"), fs::Permissions::from_mode(0o755)).unwrap();
    source
}

#[test]
fn concurrent_runs_have_distinct_copies_and_share_outputs_only_with_their_dependents() {
    let root = tempfile::tempdir().unwrap();
    let source = source(root.path());
    let first = plan(&source);
    let mut second = first.clone();
    second.tasks[0].env.insert("VALUE".into(), "two".into());
    thread::scope(|scope| {
        let a = scope.spawn(|| {
            first
                .execute(&root.path().join("a"), &Cancellation::default())
                .unwrap()
        });
        let b = scope.spawn(|| {
            second
                .execute(&root.path().join("b"), &Cancellation::default())
                .unwrap()
        });
        assert!(a.join().unwrap().success());
        assert!(b.join().unwrap().success());
    });
    for (run, value) in [("a", "one"), ("b", "two")] {
        let workspace = root.path().join(run).join("workspace");
        assert_eq!(fs::read_to_string(workspace.join("input")).unwrap(), value);
        assert_eq!(
            fs::read_to_string(workspace.join("consumed")).unwrap(),
            value
        );
        assert!(!workspace.join("unselected").exists());
        assert_eq!(
            fs::metadata(workspace.join("script"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o755
        );
    }
    assert_eq!(
        fs::read_to_string(source.join("input")).unwrap(),
        "original"
    );
    assert!(!source.join("output").exists());
}

#[test]
fn physical_working_directory_remains_in_cache_identity() {
    let root = tempfile::tempdir().unwrap();
    let source = source(root.path());
    let mut p = plan(&source);
    p.tasks.truncate(1);
    p.tasks[0].program = "/bin/sh".into();
    p.tasks[0].args = vec!["-c".into(), "pwd > output".into()];
    p.tasks[0].cache = Some(
        serde_json::from_value(
            json!({"inputs":["input"],"outputs":["output"],"toolchain":"workspace-test"}),
        )
        .unwrap(),
    );
    p.cache_dir = Some(root.path().join("cache"));
    let a = p
        .execute(&root.path().join("a"), &Cancellation::default())
        .unwrap();
    let b = p
        .execute(&root.path().join("b"), &Cancellation::default())
        .unwrap();
    assert!(a.success() && b.success(), "{a:?} {b:?}");
    assert_eq!(a.tasks[0].cache.outcome, "stored");
    assert_eq!(b.tasks[0].cache.outcome, "stored");
    assert_ne!(a.tasks[0].cache.key, b.tasks[0].cache.key);
    assert_ne!(
        fs::read(root.path().join("a/workspace/output")).unwrap(),
        fs::read(root.path().join("b/workspace/output")).unwrap()
    );
}

#[test]
fn unsafe_workspace_paths_links_and_overlapping_run_storage_fail_before_execution() {
    let root = tempfile::tempdir().unwrap();
    let source = source(root.path());
    let mut p = plan(&source);
    p.tasks[0].cwd = "..".into();
    assert!(p
        .execute(&root.path().join("escape"), &Cancellation::default())
        .is_err());
    assert!(!root.path().join("escape").exists());
    p.tasks[0].cwd = source.clone();
    assert!(p.validate().is_err());
    p.tasks[0].cwd = ".".into();
    p.workspace.as_mut().unwrap().inputs = vec!["../source".into()];
    assert!(p.validate().is_err());
    p.workspace.as_mut().unwrap().inputs = vec!["input".into(), "input/nested".into()];
    assert!(p.validate().is_err());
    fs::create_dir(source.join("tree")).unwrap();
    symlink(source.join("input"), source.join("tree/link")).unwrap();
    p.workspace.as_mut().unwrap().inputs = vec!["tree".into()];
    assert!(p
        .execute(&root.path().join("linked"), &Cancellation::default())
        .unwrap_err()
        .contains("symlink"));
    assert!(!root.path().join("linked").exists());
    fs::remove_file(source.join("tree/link")).unwrap();
    assert!(p
        .execute(&source.join("tree/run"), &Cancellation::default())
        .unwrap_err()
        .contains("overlaps"));
    assert!(!source.join("tree/run").exists());
}

#[test]
fn cancelled_setup_does_not_create_a_run() {
    let root = tempfile::tempdir().unwrap();
    let source = source(root.path());
    let cancel = Cancellation::default();
    cancel.cancel();
    assert!(plan(&source)
        .execute(&root.path().join("cancelled"), &cancel)
        .is_err());
    assert!(!root.path().join("cancelled").exists());
    let mut empty = plan(&source);
    empty.workspace.as_mut().unwrap().inputs.clear();
    assert!(empty.execute(&root.path().join("empty"), &cancel).is_err());
    assert!(!root.path().join("empty").exists());
}

#[test]
fn relocatable_workspace_cache_restores_outputs_logs_and_invalidates_inputs() {
    let root = tempfile::tempdir().unwrap();
    let source = source(root.path());
    let mut p = plan(&source);
    p.tasks.truncate(1);
    p.tasks[0].program = "/bin/sh".into();
    // The marker is deliberately outside the cache contract, solely to observe
    // whether the fixture process ran. Its output otherwise depends only on input.
    let marker = root.path().join("executions");
    p.tasks[0]
        .env
        .insert("MARKER".into(), marker.to_string_lossy().into());
    p.tasks[0].args = vec![
        "-c".into(),
        "/bin/cat input > output; printf run >> \"$MARKER\"; printf log; printf error >&2".into(),
    ];
    p.tasks[0].cache = Some(
        serde_json::from_value(json!({
            "inputs":["input"], "outputs":["output"], "toolchain":"relocatable-fixture",
            "relocatable":true
        }))
        .unwrap(),
    );
    p.cache_dir = Some(root.path().join("cache"));
    let (a, b) = thread::scope(|scope| {
        let first = scope.spawn(|| {
            p.execute(&root.path().join("a"), &Cancellation::default())
                .unwrap()
        });
        let second = scope.spawn(|| {
            p.execute(&root.path().join("b"), &Cancellation::default())
                .unwrap()
        });
        (first.join().unwrap(), second.join().unwrap())
    });
    assert!(a.success() && b.success(), "{a:?} {b:?}");
    let mut outcomes = [
        a.tasks[0].cache.outcome.as_str(),
        b.tasks[0].cache.outcome.as_str(),
    ];
    outcomes.sort();
    assert_eq!(outcomes, ["hit", "stored"]);
    assert_eq!(a.tasks[0].cache.key, b.tasks[0].cache.key);
    assert_eq!(fs::read_to_string(&marker).unwrap(), "run");
    assert_eq!(fs::read_to_string(&b.tasks[0].stdout).unwrap(), "log");
    assert_eq!(fs::read_to_string(&b.tasks[0].stderr).unwrap(), "error");
    assert_eq!(
        fs::read_to_string(root.path().join("b/workspace/output")).unwrap(),
        "original"
    );
    fs::write(source.join("input"), "changed").unwrap();
    let c = p
        .execute(&root.path().join("c"), &Cancellation::default())
        .unwrap();
    assert!(c.success());
    assert_eq!(c.tasks[0].cache.outcome, "stored");
    assert_ne!(b.tasks[0].cache.key, c.tasks[0].cache.key);
    assert_eq!(
        fs::read_to_string(root.path().join("c/workspace/output")).unwrap(),
        "changed"
    );
    assert_eq!(fs::read_to_string(&marker).unwrap(), "runrun");
    p.tasks[0].cache.as_mut().unwrap().relocatable = false;
    let d = p
        .execute(&root.path().join("d"), &Cancellation::default())
        .unwrap();
    assert!(d.success());
    assert_eq!(d.tasks[0].cache.outcome, "stored");
    assert_ne!(c.tasks[0].cache.key, d.tasks[0].cache.key);
}
