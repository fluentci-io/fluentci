#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan, Status, Task};
use std::{collections::BTreeMap, fs, path::Path, thread, time::Duration};
use tempfile::TempDir;

fn task(id: &str, script: &str, cwd: &Path, needs: &[&str]) -> Task {
    Task {
        id: id.into(),
        needs: needs.iter().map(|s| s.to_string()).collect(),
        program: "/bin/sh".into(),
        args: vec!["-c".into(), script.into()],
        cwd: cwd.into(),
        env: BTreeMap::new(),
        resources: vec![],
        shared_resources: vec![],
        package_install: None,
        file_operation: None,
        env_files: vec![],
        package_environment: vec![],
        resource_wait_timeout_ms: None,
        timeout_ms: Some(3000),
        cache: None,
        service: None,
        policy: Default::default(),
    }
}
fn plan(tasks: Vec<Task>) -> Plan {
    Plan {
        workspace: None,
        version: 1,
        resource_dir: None,
        max_services: 8,
        tasks,
        jobs: 2,
        fail_fast: true,
        inherit_env: true,
        cache_dir: None,
    }
}

#[test]
fn independent_branches_overlap_and_join_waits_for_both() {
    let dir = TempDir::new().unwrap();
    let p = plan(vec![
        task("root", "echo root >> root", dir.path(), &[]),
        task(
            "left",
            "touch left; while [ ! -e right ]; do sleep 0.01; done; echo left",
            dir.path(),
            &["root"],
        ),
        task(
            "right",
            "touch right; while [ ! -e left ]; do sleep 0.01; done; echo right",
            dir.path(),
            &["root"],
        ),
        task(
            "join",
            "test -e left && test -e right && echo joined",
            dir.path(),
            &["left", "right"],
        ),
    ]);
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    assert_eq!(
        fs::read_to_string(dir.path().join("root")).unwrap(),
        "root\n"
    );
    assert_eq!(
        fs::read_to_string(&result.tasks[3].stdout).unwrap(),
        "joined\n"
    );
}

#[test]
fn jobs_limit_and_resource_locks_prevent_overlap() {
    for (jobs, resource) in [(1, false), (2, true)] {
        let dir = TempDir::new().unwrap();
        let script = "mkdir exclusive || exit 9; sleep 0.04; rmdir exclusive";
        let mut p = plan(vec![
            task("a", script, dir.path(), &[]),
            task("b", script, dir.path(), &[]),
        ]);
        p.jobs = jobs;
        if resource {
            for t in &mut p.tasks {
                t.resources.push("workspace".into());
            }
        }
        assert!(p
            .execute(&dir.path().join("run"), &Cancellation::default())
            .unwrap()
            .success());
    }
}

#[test]
fn concurrent_runs_have_separate_environments_and_results() {
    let dir = TempDir::new().unwrap();
    let mut a = task(
        "same-id",
        "printf '%s' \"$FLUENTCI_TEST_LOCAL\"",
        dir.path(),
        &[],
    );
    a.env.insert("FLUENTCI_TEST_LOCAL".into(), "first".into());
    let mut b = a.clone();
    b.env.insert("FLUENTCI_TEST_LOCAL".into(), "second".into());
    let first = plan(vec![a]);
    let second = plan(vec![b]);
    let before = std::env::var_os("FLUENTCI_TEST_LOCAL");
    thread::scope(|s| {
        let a = s.spawn(|| {
            first
                .execute(&dir.path().join("a"), &Cancellation::default())
                .unwrap()
        });
        let b = s.spawn(|| {
            second
                .execute(&dir.path().join("b"), &Cancellation::default())
                .unwrap()
        });
        assert_eq!(
            fs::read_to_string(&a.join().unwrap().tasks[0].stdout).unwrap(),
            "first"
        );
        assert_eq!(
            fs::read_to_string(&b.join().unwrap().tasks[0].stdout).unwrap(),
            "second"
        );
    });
    assert_eq!(std::env::var_os("FLUENTCI_TEST_LOCAL"), before);
}

#[test]
fn argument_boundaries_and_both_output_streams_are_preserved() {
    let dir = TempDir::new().unwrap();
    let mut t = task(
        "args",
        "printf '%s' \"$1\"; printf error >&2",
        dir.path(),
        &[],
    );
    t.args.extend(["test".into(), "a b;$HOME $(false)".into()]);
    let result = plan(vec![t])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success());
    assert_eq!(
        fs::read_to_string(&result.tasks[0].stdout).unwrap(),
        "a b;$HOME $(false)"
    );
    assert_eq!(
        fs::read_to_string(&result.tasks[0].stderr).unwrap(),
        "error"
    );
}

#[test]
fn failed_dependency_skips_descendants_but_can_continue_independent_work() {
    let dir = TempDir::new().unwrap();
    let mut p = plan(vec![
        task("bad", "exit 7", dir.path(), &[]),
        task("skip", "touch unexpected", dir.path(), &["bad"]),
        task("good", "echo ok", dir.path(), &[]),
    ]);
    p.fail_fast = false;
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].exit_code, Some(7));
    assert_eq!(result.tasks[1].status, Status::Skipped);
    assert_eq!(result.tasks[2].status, Status::Succeeded);
    assert!(!dir.path().join("unexpected").exists());
}

#[test]
fn failure_cancels_running_sibling_and_timeout_is_distinct() {
    let dir = TempDir::new().unwrap();
    let p = plan(vec![
        task("bad", "exit 1", dir.path(), &[]),
        task("slow", "sleep 60", dir.path(), &[]),
    ]);
    let result = p
        .execute(&dir.path().join("fail"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[1].status, Status::Cancelled);
    assert_eq!(result.outcome.as_str(), "failed");
    let mut t = task("timeout", "sleep 60", dir.path(), &[]);
    t.timeout_ms = Some(30);
    let result = plan(vec![t])
        .execute(&dir.path().join("timeout"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::TimedOut);
    assert_eq!(result.outcome.as_str(), "failed");
}

#[test]
fn external_cancellation_terminates_process_group() {
    let dir = TempDir::new().unwrap();
    let p = plan(vec![task(
        "child",
        "sleep 60 & echo $! > child.pid; wait",
        dir.path(),
        &[],
    )]);
    let cancel = Cancellation::default();
    thread::scope(|scope| {
        let run = scope.spawn(|| p.execute(&dir.path().join("run"), &cancel).unwrap());
        for _ in 0..200 {
            if dir.path().join("child.pid").exists() {
                break;
            }
            thread::sleep(Duration::from_millis(5));
        }
        cancel.cancel();
        let result = run.join().unwrap();
        assert_eq!(result.tasks[0].status, Status::Cancelled);
        assert_eq!(result.outcome.as_str(), "cancelled");
    });
    let pid: i32 = fs::read_to_string(dir.path().join("child.pid"))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    // Orphan reaping is asynchronous; the descendant must disappear promptly.
    for _ in 0..200 {
        if unsafe { libc::kill(pid, 0) } != 0 {
            return;
        }
        thread::sleep(Duration::from_millis(5));
    }
    panic!("descendant {pid} survived cancellation");
}

#[test]
fn invalid_plan_and_existing_run_directory_are_rejected_without_effects() {
    let dir = TempDir::new().unwrap();
    let p = plan(vec![task(
        "bad",
        "touch unexpected",
        dir.path(),
        &["missing"],
    )]);
    assert!(p
        .execute(&dir.path().join("invalid"), &Cancellation::default())
        .is_err());
    assert!(!dir.path().join("invalid").exists());
    let p = plan(vec![task("valid", "touch unexpected", dir.path(), &[])]);
    assert!(p.execute(dir.path(), &Cancellation::default()).is_err());
    assert!(!dir.path().join("unexpected").exists());
}

#[test]
fn empty_plan_and_spawn_failure_return_reports() {
    let dir = TempDir::new().unwrap();
    assert!(plan(vec![])
        .execute(&dir.path().join("empty"), &Cancellation::default())
        .unwrap()
        .success());
    let mut t = task("missing", "", dir.path(), &[]);
    t.program = "/does/not/exist".into();
    let result = plan(vec![t])
        .execute(&dir.path().join("missing"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::Failed);
    assert!(result.tasks[0].error.is_some());
    assert!(dir.path().join("missing/result.json").exists());
}

#[test]
fn invalid_protocol_and_limits_are_rejected() {
    let mut p = plan(vec![]);
    p.version = 2;
    assert!(p.validate().unwrap_err().contains("version"));
    p.version = 1;
    p.jobs = 0;
    assert!(p.validate().unwrap_err().contains("jobs"));
    assert!(serde_json::from_str::<Plan>(r#"{"tasks":[],"unexpected":true}"#).is_err());
}

#[test]
fn explicit_environment_and_task_working_directories_are_respected() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("one")).unwrap();
    fs::create_dir(dir.path().join("two")).unwrap();
    let mut p = plan(vec![
        task(
            "one",
            "test -z \"$HOME\" && echo one > marker",
            &dir.path().join("one"),
            &[],
        ),
        task(
            "two",
            "test -z \"$HOME\" && echo two > marker",
            &dir.path().join("two"),
            &[],
        ),
    ]);
    p.inherit_env = false;
    assert!(p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap()
        .success());
    assert_eq!(
        fs::read_to_string(dir.path().join("one/marker")).unwrap(),
        "one\n"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("two/marker")).unwrap(),
        "two\n"
    );
}
