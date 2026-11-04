#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan, Status};
use serde_json::{json, Value};
use std::{
    fs,
    time::{Duration, Instant},
};
fn task(id: &str, script: &str, needs: &[&str]) -> Value {
    json!({"id":id,"program":"/bin/sh","args":["-c",script],"cwd":"/", "needs": needs, "timeout_ms":3000})
}
fn service(id: &str, script: &str, probe: &str, needs: &[&str]) -> Value {
    let mut t = task(id, script, needs);
    t["service"] = json!({"readiness":{"program":"/bin/sh","args":["-c",probe],"interval_ms":10,"timeout_ms":100},"startup_timeout_ms":500,"shutdown_timeout_ms":150,"failure_threshold":2});
    t
}
fn plan(root: &std::path::Path, tasks: Vec<Value>) -> Plan {
    let mut p: Plan =
        serde_json::from_value(json!({"jobs":1,"fail_fast":false,"tasks":tasks})).unwrap();
    for task in &mut p.tasks {
        task.cwd = root.into();
    }
    p
}
const DAEMON: &str =
    "trap 'echo stopped >> shutdown; exit 0' TERM; touch ready; while :; do sleep 0.02; done";
#[test]
fn readiness_allows_jobs_one_and_teardown_waits_for_transitive_consumers() {
    let dir = tempfile::tempdir().unwrap();
    let p = plan(
        dir.path(),
        vec![
            service("db", DAEMON, "test -f ready", &[]),
            task("first", "test -f ready; test ! -f shutdown", &["db"]),
            task(
                "last",
                "sleep 0.05; test ! -f shutdown; echo consumed",
                &["first"],
            ),
        ],
    );
    let r = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(r.success(), "{r:?}");
    assert_eq!(
        fs::read_to_string(dir.path().join("shutdown"))
            .unwrap()
            .trim(),
        "stopped"
    );
    let events = fs::read_to_string(dir.path().join("run/events.jsonl")).unwrap();
    let states: Vec<Value> = events
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .filter(|e: &Value| e["type"] == "task_state")
        .collect();
    let ready = states.iter().position(|e| e["status"] == "ready").unwrap();
    let first = states
        .iter()
        .position(|e| e["id"] == "first" && e["status"] == "running")
        .unwrap();
    assert!(ready < first);
}
#[test]
fn startup_timeout_and_early_exit_skip_consumers() {
    for (script, probe, expected) in [
        ("sleep 10", "exit 1", Status::TimedOut),
        ("exit 0", "exit 0", Status::Failed),
        ("sleep 10", "sleep 10", Status::TimedOut),
    ] {
        let dir = tempfile::tempdir().unwrap();
        let p = plan(
            dir.path(),
            vec![
                service("db", script, probe, &[]),
                task("consumer", "touch unexpected", &["db"]),
            ],
        );
        let start = Instant::now();
        let r = p
            .execute(&dir.path().join("run"), &Cancellation::default())
            .unwrap();
        assert_eq!(r.tasks[0].status, expected, "{r:?}");
        assert_eq!(r.tasks[1].status, Status::Skipped);
        assert!(!dir.path().join("unexpected").exists());
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
#[test]
fn unhealthy_service_cancels_active_consumers_without_stopping_independent_work() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = plan(
        dir.path(),
        vec![
            service("db", DAEMON, "test -f ready && test ! -f unhealthy", &[]),
            task(
                "consumer",
                "touch unhealthy; sleep 10; touch unexpected",
                &["setup"],
            ),
            task("independent", "sleep 0.1; echo fine", &[]),
            task("setup", "echo setup", &["db"]),
        ],
    );
    p.jobs = 2;
    let r = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(r.tasks[0].status, Status::Failed, "{r:?}");
    assert_eq!(r.tasks[1].status, Status::Cancelled);
    assert_eq!(r.tasks[2].status, Status::Succeeded);
    assert!(!dir.path().join("unexpected").exists());
}
#[test]
fn cancellation_kills_service_and_probe_process_groups() {
    let dir = tempfile::tempdir().unwrap();
    let p = plan(
        dir.path(),
        vec![service(
            "db",
            "trap '' TERM; echo $$ > daemon.pid; sleep 20",
            "echo $$ > probe.pid; sleep 20",
            &[],
        )],
    );
    let cancel = Cancellation::default();
    std::thread::scope(|s| {
        let handle = s.spawn(|| p.execute(&dir.path().join("run"), &cancel).unwrap());
        let start = Instant::now();
        while !dir.path().join("probe.pid").exists() {
            assert!(start.elapsed() < Duration::from_secs(2));
            std::thread::sleep(Duration::from_millis(5));
        }
        cancel.cancel();
        assert_eq!(handle.join().unwrap().tasks[0].status, Status::Cancelled);
    });
    for file in ["daemon.pid", "probe.pid"] {
        let pid: i32 = fs::read_to_string(dir.path().join(file))
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    }
}
#[test]
fn service_dependencies_teardown_in_reverse_order_and_capacity_deadlock_fails() {
    for capacity in [1, 2] {
        let dir = tempfile::tempdir().unwrap();
        let mut p = plan(
            dir.path(),
            vec![
                service(
                    "db",
                    "trap 'echo db >> shutdown; exit 0' TERM; while :; do sleep 0.02; done",
                    "exit 0",
                    &[],
                ),
                service(
                    "api",
                    "trap 'echo api >> shutdown; exit 0' TERM; while :; do sleep 0.02; done",
                    "exit 0",
                    &["db"],
                ),
                task("test", "echo tested", &["api"]),
            ],
        );
        p.max_services = capacity;
        let r = p
            .execute(&dir.path().join("run"), &Cancellation::default())
            .unwrap();
        if capacity == 2 {
            assert!(r.success(), "{r:?}");
            assert_eq!(
                fs::read_to_string(dir.path().join("shutdown")).unwrap(),
                "api\ndb\n"
            );
        } else {
            assert!(!r.success());
            assert!(r.tasks[0]
                .error
                .as_ref()
                .unwrap()
                .contains("prevent progress"));
        }
    }
}

#[test]
fn cancellation_tears_down_service_dependents_before_providers() {
    let dir = tempfile::tempdir().unwrap();
    let p = plan(
        dir.path(),
        vec![
            service(
                "db",
                "trap 'echo db >> shutdown; exit 0' TERM; while :; do sleep 0.02; done",
                "exit 0",
                &[],
            ),
            service(
                "api",
                "trap 'echo api >> shutdown; exit 0' TERM; while :; do sleep 0.02; done",
                "exit 0",
                &["db"],
            ),
            task("consumer", "touch consuming; sleep 20", &["api"]),
        ],
    );
    let cancel = Cancellation::default();
    std::thread::scope(|s| {
        let handle = s.spawn(|| p.execute(&dir.path().join("run"), &cancel).unwrap());
        let started = Instant::now();
        while !dir.path().join("consuming").exists() {
            assert!(started.elapsed() < Duration::from_secs(2));
            std::thread::sleep(Duration::from_millis(5));
        }
        cancel.cancel();
        let r = handle.join().unwrap();
        assert!(
            r.tasks.iter().all(|t| t.status == Status::Cancelled),
            "{r:?}"
        );
    });
    assert_eq!(
        fs::read_to_string(dir.path().join("shutdown")).unwrap(),
        "api\ndb\n"
    );
}

#[test]
fn service_crash_after_readiness_cancels_consumer() {
    let dir = tempfile::tempdir().unwrap();
    let p = plan(
        dir.path(),
        vec![
            service(
                "db",
                "touch ready; while [ ! -f consuming ]; do sleep 0.01; done; exit 0",
                "test -f ready",
                &[],
            ),
            task("consumer", "touch consuming; sleep 20", &["db"]),
        ],
    );
    let r = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(r.tasks[0].status, Status::Failed);
    assert_eq!(r.tasks[1].status, Status::Cancelled);
}

#[test]
fn invalid_service_contracts_are_rejected_without_effects() {
    let dir = tempfile::tempdir().unwrap();
    let base = plan(
        dir.path(),
        vec![
            service("db", DAEMON, "test -f ready", &[]),
            task("consumer", "true", &["db"]),
        ],
    );
    let mut invalid = base.clone();
    invalid.tasks[0]
        .service
        .as_mut()
        .unwrap()
        .readiness
        .timeout_ms = 0;
    assert!(invalid.validate().is_err());
    invalid = base.clone();
    invalid.tasks[0].resources.push("shared".into());
    invalid.tasks[1].resources.push("shared".into());
    assert!(invalid
        .validate()
        .unwrap_err()
        .contains("exclusive resource"));
    invalid = base;
    invalid.inherit_env = false;
    invalid.cache_dir = Some(dir.path().join("cache"));
    invalid.tasks[1].cache = Some(fluentci_executor::cache::CachePolicy {
        toolchain_files: vec![],
        relocatable: false,
        inputs: vec![],
        outputs: vec!["out".into()],
        toolchain: "test".into(),
    });
    assert!(invalid
        .validate()
        .unwrap_err()
        .contains("consumers cannot be cached"));
}

#[test]
fn separate_health_probe_runs_only_after_readiness_and_keeps_service_alive() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = service(
        "db",
        DAEMON,
        "test -f ready && test ! -f became-ready && touch became-ready",
        &[],
    );
    db["service"]["health"] = json!({"program":"/bin/sh", "args":["-c", "test -f became-ready && touch health-checked"], "interval_ms":10, "timeout_ms":100});
    let p = plan(dir.path(), vec![db, task("consumer",
        "while test ! -f health-checked; do sleep 0.01; done; sleep 0.1; test ! -f shutdown", &["db"])]);
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    assert!(dir.path().join("health-checked").exists());
}

#[test]
fn separate_health_timeout_kills_probe_and_cancels_consumers() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = service("db", DAEMON, "test -f ready", &[]);
    db["service"]["health"] = json!({"program":"/bin/sh", "args":["-c", "echo $$ > health.pid; sleep 20"], "interval_ms":10, "timeout_ms":40});
    db["service"]["failure_threshold"] = json!(1);
    let p = plan(dir.path(), vec![db, task("consumer", "sleep 20", &["db"])]);
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::Failed, "{result:?}");
    assert_eq!(result.tasks[1].status, Status::Cancelled);
    let pid: i32 = fs::read_to_string(dir.path().join("health.pid"))
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    for health in [
        json!({"program":""}),
        json!({"program":"/bin/true", "interval_ms":0}),
        json!({"program":"/bin/true", "timeout_ms":0}),
    ] {
        let mut invalid = p.clone();
        invalid.tasks[0].service.as_mut().unwrap().health =
            Some(serde_json::from_value(health).unwrap());
        assert!(invalid.validate().is_err());
    }
}

#[test]
fn failed_health_probes_retain_binary_output_separately_from_service_logs() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = service("db", DAEMON, "printf startup-probe; test -f ready", &[]);
    db["service"]["health"] = json!({"program":"/bin/sh", "args":["-c", r"printf '\377'; printf health-diagnostic >&2; exit 1"], "interval_ms":10, "timeout_ms":100});
    let p = plan(dir.path(), vec![db, task("consumer", "sleep 20", &["db"])]);
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::Failed, "{result:?}");
    assert_eq!(result.tasks[1].status, Status::Cancelled);
    let logs = result.tasks[0].probe_logs.as_ref().unwrap();
    let stdout = fs::read(&logs.stdout).unwrap();
    assert_eq!(stdout.iter().filter(|&&byte| byte == 255).count(), 2);
    assert!(stdout
        .windows(b"startup-probe".len())
        .any(|bytes| bytes == b"startup-probe"));
    let stderr = fs::read_to_string(&logs.stderr).unwrap();
    assert_eq!(stderr.matches("health-diagnostic").count(), 2);
    assert_eq!(stderr.matches("--- health probe ---").count(), 2);
    assert!(!fs::read_to_string(&result.tasks[0].stderr)
        .unwrap()
        .contains("health-diagnostic"));
    assert!(result.tasks[1].probe_logs.is_none());
    let report: Value =
        serde_json::from_slice(&fs::read(dir.path().join("run/result.json")).unwrap()).unwrap();
    assert_eq!(
        report["tasks"][0]["probe_logs"]["stdout"],
        logs.stdout.to_str().unwrap()
    );
    assert!(report["tasks"][1].get("probe_logs").is_none());
}

#[test]
fn very_large_health_intervals_do_not_overflow_scheduler_deadlines() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = service("db", DAEMON, "exit 0", &[]);
    db["service"]["health"] = json!({
        "program": "/bin/sh", "args": ["-c", "echo unexpected > health"],
        "interval_ms": u64::MAX, "timeout_ms": 100
    });
    let p = plan(
        dir.path(),
        vec![db, task("consumer", "sleep 0.05; echo done", &["db"])],
    );
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(result.success(), "{result:?}");
    assert!(!dir.path().join("health").exists());
}

#[test]
fn probe_failures_report_phase_and_cause_without_command_arguments() {
    for (command, timeout, expected) in [
        (
            "exit 7 # private-argument",
            100,
            "health probe exited with exit status: 7",
        ),
        (
            "sleep 10 # private-argument",
            20,
            "health probe timed out after 20 ms",
        ),
    ] {
        let dir = tempfile::tempdir().unwrap();
        let mut db = service("db", DAEMON, "exit 0", &[]);
        db["service"]["health"] = json!({
            "program": "/bin/sh", "args": ["-c", command],
            "interval_ms": 10, "timeout_ms": timeout
        });
        let p = plan(dir.path(), vec![db, task("consumer", "sleep 10", &["db"])]);
        let result = p
            .execute(&dir.path().join("run"), &Cancellation::default())
            .unwrap();
        assert_eq!(result.tasks[0].status, Status::Failed);
        assert_eq!(result.tasks[1].status, Status::Cancelled);
        let error = result.tasks[0].error.as_ref().unwrap();
        assert!(error.contains(expected), "{error}");
        assert!(error.contains("2 consecutive failures"), "{error}");
        assert!(!error.contains("private-argument"));
        let events = fs::read_to_string(dir.path().join("run/events.jsonl")).unwrap();
        assert!(events
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).unwrap())
            .any(|event| event["id"] == "db" && event["error"] == *error));
    }
    for phase in ["readiness", "health"] {
        let dir = tempfile::tempdir().unwrap();
        let mut db = service("db", DAEMON, "exit 0", &[]);
        db["service"][phase] = json!({
            "program": dir.path().join("missing-probe"), "args": ["private-argument"],
            "interval_ms": 10, "timeout_ms": 100
        });
        let p = plan(dir.path(), vec![db, task("consumer", "sleep 10", &["db"])]);
        let result = p
            .execute(&dir.path().join("run"), &Cancellation::default())
            .unwrap();
        assert_eq!(result.tasks[0].status, Status::Failed);
        let error = result.tasks[0].error.as_ref().unwrap();
        assert!(
            error.contains(&format!("could not spawn {phase} probe:")),
            "{error}"
        );
        assert!(error.contains("os error"), "{error}");
        assert!(!error.contains("private-argument"));
    }
}

#[test]
fn startup_timeout_preserves_the_last_readiness_failure() {
    let dir = tempfile::tempdir().unwrap();
    let p = plan(
        dir.path(),
        vec![
            service("db", DAEMON, "exit 23", &[]),
            task("consumer", "touch unexpected", &["db"]),
        ],
    );
    let result = p
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(result.tasks[0].status, Status::TimedOut);
    assert_eq!(result.tasks[1].status, Status::Skipped);
    let error = result.tasks[0].error.as_ref().unwrap();
    assert!(
        error.contains("service startup timeout after 500 ms"),
        "{error}"
    );
    assert!(
        error.contains("last failure: readiness probe exited with exit status: 23"),
        "{error}"
    );
    assert!(!dir.path().join("unexpected").exists());
}
