#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan, Status};
use serde_json::json;
use std::{
    fs,
    path::Path,
    thread,
    time::{Duration, Instant},
};
fn plan(root: &Path, script: &str, resources: &[&str]) -> Plan {
    serde_json::from_value(json!({"jobs":1,"resource_dir":root.join("locks"),"tasks":[{"id":"task","program":"/bin/sh","args":["-c",script],"cwd":root,"resources":resources,"timeout_ms":3000}]})).unwrap()
}
fn wait(path: &Path) {
    let start = Instant::now();
    while !path.exists() {
        assert!(start.elapsed() < Duration::from_secs(2));
        thread::sleep(Duration::from_millis(5));
    }
}
#[test]
fn concurrent_runs_acquire_resource_sets_without_overlap_or_order_deadlock() {
    let root = tempfile::tempdir().unwrap();
    thread::scope(|scope| {
        let mut handles = vec![];
        for i in 0..8 {
            let plan = plan(
                root.path(),
                "mkdir critical || exit 90; sleep 0.02; echo ran >> executions; rmdir critical",
                if i % 2 == 0 {
                    &["a", "b"]
                } else {
                    &["b", "a", "a"]
                },
            );
            let run = root.path().join(format!("run-{i}"));
            handles
                .push(scope.spawn(move || plan.execute(&run, &Cancellation::default()).unwrap()));
        }
        for handle in handles {
            let result = handle.join().unwrap();
            assert!(result.success(), "{result:?}");
        }
    });
    assert_eq!(
        fs::read_to_string(root.path().join("executions"))
            .unwrap()
            .lines()
            .count(),
        8
    );
}
#[test]
fn different_resource_names_allow_independent_runs_to_overlap() {
    let root = tempfile::tempdir().unwrap();
    thread::scope(|scope| {
        let a = plan(
            root.path(),
            "touch a; while [ ! -f b ]; do sleep 0.01; done",
            &["a"],
        );
        let b = plan(
            root.path(),
            "touch b; while [ ! -f a ]; do sleep 0.01; done",
            &["b"],
        );
        let first_dir = root.path().join("first");
        let second_dir = root.path().join("second");
        let first = scope.spawn(move || a.execute(&first_dir, &Cancellation::default()).unwrap());
        let second = scope.spawn(move || b.execute(&second_dir, &Cancellation::default()).unwrap());
        assert!(first.join().unwrap().success());
        assert!(second.join().unwrap().success());
    });
}
#[test]
fn waiting_can_time_out_or_cancel_without_starting_the_command() {
    let root = tempfile::tempdir().unwrap();
    let holder = plan(root.path(), "touch holding; sleep 10", &["shared"]);
    let holder_cancel = Cancellation::default();
    thread::scope(|scope| {
        let running = scope.spawn(|| {
            holder
                .execute(&root.path().join("holder"), &holder_cancel)
                .unwrap()
        });
        wait(&root.path().join("holding"));
        let mut timeout = plan(root.path(), "touch unexpected", &["shared"]);
        timeout.tasks[0].resource_wait_timeout_ms = Some(80);
        let result = timeout
            .execute(&root.path().join("timeout"), &Cancellation::default())
            .unwrap();
        assert_eq!(result.tasks[0].status, Status::TimedOut);
        assert_eq!(
            result.tasks[0].error.as_deref(),
            Some("resource wait timeout")
        );
        let waiting = plan(root.path(), "touch unexpected", &["shared"]);
        let cancel = Cancellation::default();
        let worker_cancel = cancel.clone();
        let cancelled_dir = root.path().join("cancelled");
        let result = scope.spawn(move || waiting.execute(&cancelled_dir, &worker_cancel).unwrap());
        wait(&root.path().join("cancelled/events.jsonl"));
        cancel.cancel();
        assert_eq!(result.join().unwrap().tasks[0].status, Status::Cancelled);
        assert!(!root.path().join("unexpected").exists());
        holder_cancel.cancel();
        assert_eq!(running.join().unwrap().tasks[0].status, Status::Cancelled);
    });
    let next = plan(root.path(), "echo acquired", &["shared"]);
    assert!(next
        .execute(&root.path().join("next"), &Cancellation::default())
        .unwrap()
        .success());
}
#[test]
fn symlinked_lock_files_and_shared_writable_directories_are_rejected() {
    use sha2::{Digest, Sha256};
    use std::os::unix::fs::{symlink, PermissionsExt};
    let root = tempfile::tempdir().unwrap();
    let locks = root.path().join("locks");
    fs::create_dir(&locks).unwrap();
    fs::set_permissions(&locks, fs::Permissions::from_mode(0o700)).unwrap();
    let target = root.path().join("target");
    fs::write(&target, "unchanged").unwrap();
    symlink(&target, locks.join(hex::encode(Sha256::digest(b"shared")))).unwrap();
    let p = plan(root.path(), "touch unexpected", &["shared"]);
    let result = p
        .execute(&root.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::Failed);
    assert_eq!(fs::read_to_string(target).unwrap(), "unchanged");
    assert!(!root.path().join("unexpected").exists());
    fs::set_permissions(&locks, fs::Permissions::from_mode(0o777)).unwrap();
    assert!(p
        .execute(&root.path().join("bad"), &Cancellation::default())
        .unwrap_err()
        .contains("0700"));
}

#[test]
fn executor_io_failure_cleans_children_and_releases_leases() {
    let root = tempfile::tempdir().unwrap();
    let p = plan(
        root.path(),
        "echo $$ > child.pid; while :; do sleep 0.02; done",
        &["shared"],
    );
    thread::scope(|scope| {
        let running =
            scope.spawn(|| p.execute(&root.path().join("broken"), &Cancellation::default()));
        wait(&root.path().join("child.pid"));
        let stdout = root.path().join("broken/0.stdout");
        fs::remove_file(&stdout).unwrap();
        fs::create_dir(&stdout).unwrap();
        assert!(running.join().unwrap().is_err());
    });
    let pid: i32 = fs::read_to_string(root.path().join("child.pid"))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    let next = plan(root.path(), "echo acquired", &["shared"]);
    assert!(next
        .execute(&root.path().join("next"), &Cancellation::default())
        .unwrap()
        .success());
}

#[test]
fn ready_services_keep_leases_until_shutdown() {
    let root = tempfile::tempdir().unwrap();
    let mut service = plan(
        root.path(),
        "touch holding; while :; do sleep 0.02; done",
        &["shared"],
    );
    service.tasks[0].service = Some(serde_json::from_value(json!({"readiness":{"program":"/bin/sh","args":["-c","exit 0"]},"shutdown_timeout_ms":100})).unwrap());
    let mut consumer = plan(root.path(), "sleep 20", &[]).tasks.remove(0);
    consumer.id = "consumer".into();
    consumer.needs = vec!["task".into()];
    service.tasks.push(consumer);
    let cancel = Cancellation::default();
    thread::scope(|scope| {
        let running = scope.spawn(|| {
            service
                .execute(&root.path().join("service"), &cancel)
                .unwrap()
        });
        wait(&root.path().join("holding"));
        let mut contender = plan(root.path(), "touch unexpected", &["shared"]);
        contender.tasks[0].resource_wait_timeout_ms = Some(100);
        let result = contender
            .execute(&root.path().join("blocked"), &Cancellation::default())
            .unwrap();
        assert_eq!(result.tasks[0].status, Status::TimedOut);
        assert!(!root.path().join("unexpected").exists());
        cancel.cancel();
        assert!(!running.join().unwrap().success());
    });
    let next = plan(root.path(), "echo acquired", &["shared"]);
    assert!(next
        .execute(&root.path().join("next"), &Cancellation::default())
        .unwrap()
        .success());
}

#[test]
fn shared_readers_overlap_across_runs_and_each_reader_blocks_writers() {
    let root = tempfile::tempdir().unwrap();
    let mut a = plan(
        root.path(),
        "touch reader-a; while :; do sleep 0.02; done",
        &[],
    );
    let mut b = plan(
        root.path(),
        "touch reader-b; while :; do sleep 0.02; done",
        &[],
    );
    a.tasks[0].shared_resources = vec!["prefix".into()];
    b.tasks[0].shared_resources = vec!["prefix".into()];
    let cancel_a = Cancellation::default();
    let cancel_b = Cancellation::default();
    thread::scope(|scope| {
        let first = scope.spawn(|| a.execute(&root.path().join("a"), &cancel_a).unwrap());
        let second = scope.spawn(|| b.execute(&root.path().join("b"), &cancel_b).unwrap());
        wait(&root.path().join("reader-a"));
        wait(&root.path().join("reader-b"));
        let mut writer = plan(root.path(), "touch written", &["prefix"]);
        writer.tasks[0].resource_wait_timeout_ms = Some(80);
        assert_eq!(
            writer
                .execute(&root.path().join("blocked-a"), &Cancellation::default())
                .unwrap()
                .tasks[0]
                .status,
            Status::TimedOut
        );
        cancel_a.cancel();
        first.join().unwrap();
        assert_eq!(
            writer
                .execute(&root.path().join("blocked-b"), &Cancellation::default())
                .unwrap()
                .tasks[0]
                .status,
            Status::TimedOut
        );
        cancel_b.cancel();
        second.join().unwrap();
        assert!(writer
            .execute(&root.path().join("writer"), &Cancellation::default())
            .unwrap()
            .success());
    });
    assert!(root.path().join("written").exists());
}

#[test]
fn resource_wait_deadlines_continue_while_job_or_service_capacity_is_full() {
    for service_slots in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let mut holder = plan(
            root.path(),
            "touch holding; while :; do sleep 0.02; done",
            &["shared"],
        );
        holder.tasks[0].timeout_ms = Some(15_000);
        let holder_cancel = Cancellation::default();
        thread::scope(|scope| {
            let holding = scope.spawn(|| {
                holder
                    .execute(&root.path().join("holder"), &holder_cancel)
                    .unwrap()
            });
            wait(&root.path().join("holding"));
            let mut waiting = plan(root.path(), "touch unexpected", &["shared"]);
            waiting.fail_fast = false;
            waiting.max_services = 1;
            waiting.tasks[0].id = "waiter".into();
            waiting.tasks[0].resource_wait_timeout_ms = Some(80);
            waiting.tasks[0].timeout_ms = Some(15_000);
            let mut independent = plan(
                root.path(),
                "touch occupied; while [ ! -f release ]; do sleep 0.02; done",
                &[],
            )
            .tasks
            .remove(0);
            independent.id = "independent".into();
            independent.timeout_ms = Some(15_000);
            if service_slots {
                let service = serde_json::from_value(json!({
                    "readiness":{"program":"/bin/sh","args":["-c","exit 0"],"interval_ms":10},
                    "shutdown_timeout_ms":100
                }))
                .unwrap();
                waiting.tasks[0].service = Some(service);
                independent.service = waiting.tasks[0].service.clone();
                independent.args = vec!["-c".into(), "while :; do sleep 0.02; done".into()];
                let mut consumer = plan(
                    root.path(),
                    "touch occupied; while [ ! -f release ]; do sleep 0.02; done",
                    &[],
                )
                .tasks
                .remove(0);
                consumer.id = "consumer".into();
                consumer.needs = vec!["independent".into()];
                consumer.timeout_ms = Some(15_000);
                waiting.tasks.push(independent);
                waiting.tasks.push(consumer);
            } else {
                waiting.tasks.push(independent);
            }
            let waiting_dir = root.path().join("waiting");
            let running = scope.spawn(move || {
                waiting
                    .execute(&waiting_dir, &Cancellation::default())
                    .unwrap()
            });
            wait(&root.path().join("occupied"));
            let deadline = Instant::now() + Duration::from_secs(2);
            let observed = loop {
                let journal = fs::read_to_string(root.path().join("waiting/events.jsonl")).unwrap();
                let timeout = journal
                    .lines()
                    .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
                    .any(|event| {
                        event["type"] == "task_state"
                            && event["id"] == "waiter"
                            && event["status"] == "timed_out"
                    });
                if timeout || Instant::now() >= deadline {
                    break timeout;
                }
                thread::sleep(Duration::from_millis(5));
            };
            let occupied_when_timed_out = !running.is_finished();
            // Release both blockers before assertions, including regression failures.
            fs::write(root.path().join("release"), b"go").unwrap();
            holder_cancel.cancel();
            holding.join().unwrap();
            let result = running.join().unwrap();
            assert!(
                observed,
                "deadline was blocked by capacity: services={service_slots}; {result:?}"
            );
            assert!(occupied_when_timed_out);
            assert_eq!(result.tasks[0].status, Status::TimedOut);
            assert_eq!(
                result.tasks[0].error.as_deref(),
                Some("resource wait timeout")
            );
            assert!(
                result.tasks[1..]
                    .iter()
                    .all(|task| task.status == Status::Succeeded),
                "{result:?}"
            );
            assert!(!root.path().join("unexpected").exists());
        });
        assert!(plan(root.path(), "echo reusable", &["shared"])
            .execute(&root.path().join("reuse"), &Cancellation::default())
            .unwrap()
            .success());
    }
}
