#![cfg(unix)]
use fluentci_executor::{
    cache::CachePolicy, files::Operation, primitives as p, Cancellation, Plan, Status, Task,
};
use serde_json::json;
use std::{fs, path::Path};

fn native(root: &Path, id: &str, op: Operation) -> Task {
    p::file_task(id, op, root)
}
fn run(root: &Path, name: &str, tasks: Vec<Task>) -> fluentci_executor::RunResult {
    p::plan(tasks)
        .execute(&root.join(name), &Cancellation::default())
        .unwrap()
}
#[test]
fn every_file_operation_runs_natively_with_structured_results() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let operations = vec![
        Operation::Mkdir {
            path: "src/sub".into(),
            parents: true,
        },
        Operation::WriteText {
            path: "src/sub/héllo ' 世界".into(),
            text: "hello\n世界".into(),
            overwrite: false,
        },
        Operation::WriteBytes {
            path: "src/bytes".into(),
            bytes: vec![0, 255, 128],
            overwrite: false,
        },
        Operation::CopyFile {
            source: "src/bytes".into(),
            destination: "bytes-copy".into(),
            overwrite: false,
        },
        Operation::CopyTree {
            source: "src".into(),
            destination: "tree".into(),
            overwrite: false,
        },
        Operation::Move {
            source: "bytes-copy".into(),
            destination: "moved".into(),
            overwrite: false,
        },
        Operation::Chmod {
            path: "moved".into(),
            mode: 0o700,
        },
        Operation::Symlink {
            target: "moved".into(),
            path: "link".into(),
        },
        Operation::Stat {
            path: "link".into(),
        },
        Operation::Exists {
            path: "moved".into(),
        },
        Operation::List { path: "src".into() },
        Operation::Glob {
            pattern: "src/**/héllo*".into(),
        },
        Operation::ReadBytes {
            path: "moved".into(),
            limit_bytes: 3,
        },
        Operation::ReadText {
            path: "src/sub/héllo ' 世界".into(),
            limit_bytes: 1024,
        },
        Operation::Hash {
            path: "moved".into(),
        },
        Operation::Remove {
            path: "tree".into(),
            recursive: true,
            missing_ok: false,
        },
    ];
    let tasks = operations
        .into_iter()
        .enumerate()
        .map(|(i, op)| {
            let task = native(root, &format!("file-{i}"), op);
            if i > 0 {
                p::needs(task, vec![format!("file-{}", i - 1)])
            } else {
                task
            }
        })
        .collect();
    let result = run(root, "run", tasks);
    assert!(result.success(), "{result:?}");
    assert!(result.tasks.iter().all(|t| t.exit_code.is_none()));
    assert_eq!(
        result.tasks[8].file_result.as_ref().unwrap()["kind"],
        "symlink"
    );
    assert_eq!(result.tasks[9].file_result, Some(json!(true)));
    assert_eq!(result.tasks[10].file_result, Some(json!(["bytes", "sub"])));
    assert_eq!(
        result.tasks[11].file_result,
        Some(json!(["src/sub/héllo ' 世界"]))
    );
    assert_eq!(result.tasks[12].file_result, Some(json!([0, 255, 128])));
    assert_eq!(result.tasks[13].file_result, Some(json!("hello\n世界")));
    assert_eq!(
        result.tasks[14]
            .file_result
            .as_ref()
            .unwrap()
            .as_str()
            .unwrap()
            .len(),
        64
    );
    assert!(!root.join("tree").exists());
    assert!(!root.join("bytes-copy").exists());
}
#[test]
fn native_writes_and_queries_restore_and_invalidate_the_action_cache() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let mut write = p::write_text("write", "value".into(), "first".into(), true, root);
    write.cache = Some(CachePolicy {
        inputs: vec![],
        outputs: vec!["value".into()],
        toolchain: "native-test".into(),
        toolchain_files: vec![],
        relocatable: false,
    });
    let mut query = p::read_text("read", "value".into(), 1024, root);
    query.cache = Some(CachePolicy {
        inputs: vec!["value".into()],
        outputs: vec![],
        toolchain: "native-test".into(),
        toolchain_files: vec![],
        relocatable: false,
    });
    query.needs = vec!["write".into()];
    let mut plan = p::plan(vec![write, query]);
    plan.cache_dir = Some(root.join("cache"));
    let first = plan
        .execute(&root.join("cold"), &Cancellation::default())
        .unwrap();
    assert!(first.success(), "{first:?}");
    fs::remove_file(root.join("value")).unwrap();
    let warm = plan
        .execute(&root.join("warm"), &Cancellation::default())
        .unwrap();
    assert!(warm.success(), "{warm:?}");
    assert!(warm.tasks.iter().all(|t| t.cache.outcome == "hit"));
    assert_eq!(warm.tasks[1].file_result, Some(json!("first")));
    plan.tasks[0].file_operation = Some(Operation::WriteText {
        path: "value".into(),
        text: "second".into(),
        overwrite: true,
    });
    let changed = plan
        .execute(&root.join("changed"), &Cancellation::default())
        .unwrap();
    assert!(changed.success(), "{changed:?}");
    assert!(changed.tasks.iter().all(|t| t.cache.outcome == "stored"));
    assert_eq!(changed.tasks[1].file_result, Some(json!("second")));
}
#[test]
fn invalid_paths_are_rejected_before_any_task_runs() {
    let root = tempfile::tempdir().unwrap();
    for path in ["../escape", "/tmp/escape", "."] {
        let result = p::plan(vec![p::write_text(
            "write",
            path.into(),
            "unexpected".into(),
            false,
            root.path(),
        )])
        .execute(&root.path().join("run"), &Cancellation::default());
        assert!(result.is_err());
        assert!(!root.path().join("run").exists());
    }
}
#[test]
fn links_special_files_overwrites_and_read_limits_have_explicit_failures() {
    let root = tempfile::tempdir().unwrap();
    let root = root.path();
    fs::write(root.join("value"), "original").unwrap();
    std::os::unix::fs::symlink(root.join("value"), root.join("link")).unwrap();
    let fifo = std::ffi::CString::new(root.join("fifo").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    for (i, op) in [
        Operation::WriteText {
            path: "value".into(),
            text: "secret payload".into(),
            overwrite: false,
        },
        Operation::ReadText {
            path: "link".into(),
            limit_bytes: 1024,
        },
        Operation::ReadBytes {
            path: "fifo".into(),
            limit_bytes: 1024,
        },
        Operation::ReadText {
            path: "value".into(),
            limit_bytes: 2,
        },
    ]
    .into_iter()
    .enumerate()
    {
        let result = run(root, &format!("run-{i}"), vec![native(root, "file", op)]);
        assert_eq!(result.tasks[0].status, Status::Failed);
        assert_eq!(result.tasks[0].exit_code, None);
        let error = result.tasks[0].error.as_ref().unwrap();
        assert!(error.contains("file operation"), "{error}");
        assert!(!error.contains("secret payload"));
        assert!(!error.starts_with("exit code"));
    }
    assert_eq!(fs::read_to_string(root.join("value")).unwrap(), "original");
}
#[test]
fn dotenv_is_literal_ordered_and_never_exposes_values_in_parse_errors() {
    let parsed = fluentci_executor::files::parse_env(
        "# hi\nexport A='$(touch injected)'\nB=one # comment\nC=\"two\\nlines\"\nA=last\n",
    )
    .unwrap();
    assert_eq!(parsed["A"], "last");
    assert_eq!(parsed["B"], "one");
    assert_eq!(parsed["C"], "two\nlines");
    assert_eq!(
        fluentci_executor::files::parse_env("A=ok\nBAD SECRET VALUE").unwrap_err(),
        "invalid env entry at line 2"
    );
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("a.env"), "A=first\nB='$(touch injected)'\n").unwrap();
    fs::write(root.join("b.env"), "A=second\n").unwrap();
    let mut task = p::env_file(
        p::env_file(
            p::exec(
                "env",
                "/bin/sh",
                vec!["-c".into(), "printf '%s|%s' \"$A\" \"$B\"".into()],
                root,
            ),
            "a.env",
        ),
        "b.env",
    );
    task.env.insert("A".into(), "explicit".into());
    let result = run(root, "run", vec![task]);
    assert!(result.success(), "{result:?}");
    assert_eq!(
        fs::read_to_string(&result.tasks[0].stdout).unwrap(),
        "explicit|$(touch injected)"
    );
    assert!(!root.join("injected").exists());
}
#[test]
fn precancelled_file_tasks_have_no_effects() {
    let root = tempfile::tempdir().unwrap();
    let cancel = Cancellation::default();
    cancel.cancel();
    let result = Plan::execute(
        &p::plan(vec![p::write_text(
            "write",
            "unexpected".into(),
            "x".into(),
            false,
            root.path(),
        )]),
        &root.path().join("run"),
        &cancel,
    )
    .unwrap();
    assert!(!result.success());
    assert!(!root.path().join("unexpected").exists());
}

#[test]
fn env_file_changes_invalidate_cached_process_environment() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("ci.env"), "VALUE=first\n").unwrap();
    let mut task = p::env_file(
        p::exec("env", "/usr/bin/printenv", vec!["VALUE".into()], root),
        "ci.env",
    );
    task.cache = Some(CachePolicy {
        inputs: vec![],
        outputs: vec![],
        toolchain: "printenv-test".into(),
        toolchain_files: vec![],
        relocatable: false,
    });
    let mut plan = p::plan(vec![task]);
    plan.cache_dir = Some(root.join("cache"));
    let cold = plan
        .execute(&root.join("cold"), &Cancellation::default())
        .unwrap();
    assert!(cold.success(), "{cold:?}");
    let warm = plan
        .execute(&root.join("warm"), &Cancellation::default())
        .unwrap();
    assert_eq!(warm.tasks[0].cache.outcome, "hit");
    fs::write(root.join("ci.env"), "VALUE=second\n").unwrap();
    let changed = plan
        .execute(&root.join("changed"), &Cancellation::default())
        .unwrap();
    assert!(changed.success(), "{changed:?}");
    assert_eq!(changed.tasks[0].cache.outcome, "stored");
    assert_eq!(
        fs::read_to_string(&changed.tasks[0].stdout).unwrap(),
        "second\n"
    );
}

#[test]
fn explicit_overwrite_merges_trees_and_removal_never_traverses_links() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir(root.join("source")).unwrap();
    fs::create_dir(root.join("target")).unwrap();
    fs::write(root.join("source/value"), "replacement").unwrap();
    fs::write(root.join("target/value"), "old").unwrap();
    fs::write(root.join("target/keep"), "keep").unwrap();
    let copied = run(
        root,
        "copy",
        vec![p::copy_tree(
            "copy",
            "source".into(),
            "target".into(),
            true,
            root,
        )],
    );
    assert!(copied.success(), "{copied:?}");
    assert_eq!(
        fs::read_to_string(root.join("target/value")).unwrap(),
        "replacement"
    );
    assert!(root.join("target/keep").exists());
    std::os::unix::fs::symlink(root.join("target"), root.join("link")).unwrap();
    let removed = run(
        root,
        "remove",
        vec![p::remove("remove", "link".into(), true, false, root)],
    );
    assert!(removed.success(), "{removed:?}");
    assert!(root.join("target/value").exists());
    assert!(!root.join("link").exists());
}
#[test]
fn dotenv_values_reach_service_processes_and_readiness_probes() {
    use fluentci_executor::service::{Probe, Service};
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("service.env"), "FILE_VAR=ready\n").unwrap();
    let mut service = p::env_file(
        p::exec(
            "service",
            "/bin/sh",
            vec![
                "-c".into(),
                "test \"$FILE_VAR\" = ready || exit 7; exec /bin/sleep 60".into(),
            ],
            root,
        ),
        "service.env",
    );
    service.service = Some(Service {
        readiness: Probe {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "test \"$FILE_VAR\" = ready".into()],
            interval_ms: 10,
            timeout_ms: 500,
        },
        health: None,
        startup_timeout_ms: 3000,
        shutdown_timeout_ms: 100,
        failure_threshold: 1,
    });
    let consumer = p::needs(
        p::exec(
            "consumer",
            "/bin/sh",
            vec!["-c".into(), "printf consumer".into()],
            root,
        ),
        vec!["service".into()],
    );
    let result = run(root, "run", vec![service, consumer]);
    assert!(result.success(), "{result:?}");
}
#[test]
fn dotenv_parse_failures_name_the_file_and_line_without_printing_values() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(
        root.join("bad.env"),
        "KEY=secret\nPRIVATE SECRET MALFORMED\n",
    )
    .unwrap();
    let task = p::env_file(
        p::exec(
            "task",
            "/bin/sh",
            vec!["-c".into(), "touch unexpected".into()],
            root,
        ),
        "bad.env",
    );
    let result = run(root, "run", vec![task]);
    assert_eq!(result.tasks[0].status, Status::Failed);
    let error = result.tasks[0].error.as_ref().unwrap();
    assert!(error.contains("bad.env"));
    assert!(error.contains("line 2"));
    assert!(!error.contains("SECRET"));
    assert!(!error.contains("secret"));
    assert!(!root.join("unexpected").exists());
}

#[test]
fn dotted_path_aliases_cannot_bypass_copy_or_move_overlap_preflight() {
    let root = tempfile::tempdir().unwrap();
    for (source, destination) in [
        ("src", "./src/inside"),
        ("./src", "src"),
        ("src/nested", "./src"),
    ] {
        for operation in [
            Operation::CopyTree {
                source: source.into(),
                destination: destination.into(),
                overwrite: true,
            },
            Operation::Move {
                source: source.into(),
                destination: destination.into(),
                overwrite: true,
            },
        ] {
            let plan = p::plan(vec![native(root.path(), "unsafe", operation)]);
            let error = plan
                .execute(&root.path().join("run"), &Cancellation::default())
                .unwrap_err();
            assert!(error.contains("overlap"), "{error}");
            assert!(!root.path().join("run").exists());
        }
    }
}
