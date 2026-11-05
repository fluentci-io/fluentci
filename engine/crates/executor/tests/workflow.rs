#![cfg(unix)]
use fluentci_executor::{
    primitives as p,
    workflow::{Condition, Retry},
    Cancellation, Status,
};
use std::{fs, thread, time::Duration};
fn command(root: &std::path::Path, id: &str, text: &str) -> fluentci_executor::Task {
    p::timeout(
        p::exec(id, "/bin/sh", vec!["-c".into(), text.into()], root),
        5000,
    )
}
#[test]
fn retries_keep_attempts_logs_and_release_resources_while_backing_off() {
    let dir = tempfile::tempdir().unwrap();
    let build = p::retry(
        command(
            dir.path(),
            "flaky",
            "printf attempt; if test ! -f marker; then touch marker; exit 7; fi",
        ),
        3,
        10,
    );
    let report = p::plan(vec![build])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(report.success(), "{report:?}");
    assert_eq!(report.tasks[0].attempts.len(), 2);
    assert_eq!(report.tasks[0].attempts[0].exit_code, Some(7));
    assert_eq!(
        fs::read_to_string(&report.tasks[0].stdout).unwrap(),
        "attemptattempt"
    );
    let retry = Retry {
        max_attempts: 100,
        delay_ms: 10,
        max_delay_ms: 50,
        exit_codes: vec![],
    };
    assert_eq!(
        [retry.delay(1), retry.delay(2), retry.delay(99)],
        [10, 20, 50]
    );
}
#[test]
fn finalizers_failure_conditions_and_allowed_failures_preserve_real_outcomes() {
    let dir = tempfile::tempdir().unwrap();
    let bad = command(dir.path(), "bad", "exit 3");
    let cleanup = p::always(p::needs(
        command(dir.path(), "cleanup", "touch cleaned"),
        vec![bad.id.clone()],
    ));
    let handler = p::when(
        p::needs(
            command(dir.path(), "handler", "touch handled"),
            vec![bad.id.clone()],
        ),
        Condition::Failure,
    );
    let report = p::plan(vec![bad, cleanup, handler])
        .execute(&dir.path().join("failed"), &Cancellation::default())
        .unwrap();
    assert!(!report.success());
    assert_eq!(report.tasks[1].status, Status::Succeeded);
    assert_eq!(report.tasks[2].status, Status::Succeeded);
    let optional = p::allow_failure(command(dir.path(), "optional", "exit 4"), true);
    let consumer = p::needs(
        command(dir.path(), "consumer", "touch consumed"),
        vec![optional.id.clone()],
    );
    let skipped = p::when(command(dir.path(), "skipped", "exit 9"), Condition::Never);
    let report = p::plan(vec![optional, consumer, skipped])
        .execute(&dir.path().join("allowed"), &Cancellation::default())
        .unwrap();
    assert!(report.success(), "{report:?}");
    assert_eq!(report.tasks[0].status, Status::Failed);
    assert_eq!(report.tasks[1].status, Status::Succeeded);
    assert_eq!(report.tasks[2].status, Status::Skipped);
}
#[test]
fn outputs_bind_literal_values_and_artifacts_survive_workspace_changes() {
    let dir = tempfile::tempdir().unwrap();
    let producer = p::artifact(
        p::output(
            command(
                dir.path(),
                "produce",
                "printf '%s' 'hello; $(touch injected)' > value.txt",
            ),
            "value",
            "value.txt",
        ),
        "report",
        "value.txt",
    );
    let consumer = p::output_env(
        command(dir.path(), "consume", "printf '%s' \"$VALUE\""),
        "VALUE",
        &producer,
        "value",
    );
    let report = p::plan(vec![producer, consumer])
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(report.success(), "{report:?}");
    let artifact = &report.tasks[0].artifacts["report"];
    fs::write(dir.path().join("value.txt"), "changed").unwrap();
    assert_eq!(
        fs::read_to_string(&artifact.path).unwrap(),
        "hello; $(touch injected)"
    );
    assert_eq!(
        fs::read_to_string(&report.tasks[1].stdout).unwrap(),
        "hello; $(touch injected)"
    );
    assert!(!dir.path().join("injected").exists());
}
#[test]
fn cancellation_still_runs_bounded_cleanup_without_retrying_commands() {
    let dir = tempfile::tempdir().unwrap();
    let work = p::retry(
        command(dir.path(), "work", "touch started; sleep 120"),
        3,
        10,
    );
    let cleanup = p::always(p::needs(
        command(dir.path(), "cleanup", "touch cleaned"),
        vec![work.id.clone()],
    ));
    let token = Cancellation::default();
    let cancel = token.clone();
    let started = dir.path().join("started");
    let worker = thread::spawn(move || {
        for _ in 0..500 {
            if started.exists() {
                cancel.cancel();
                return;
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("work never started");
    });
    let result = p::plan(vec![work, cleanup])
        .execute(&dir.path().join("run"), &token)
        .unwrap();
    worker.join().unwrap();
    assert_eq!(result.outcome, fluentci_executor::RunOutcome::Cancelled);
    assert_eq!(result.tasks[1].status, Status::Succeeded, "{result:?}");
    assert!(dir.path().join("cleaned").is_file());
}
#[test]
fn invalid_products_bindings_and_service_retry_fail_before_side_effects() {
    let dir = tempfile::tempdir().unwrap();
    for task in [
        p::artifact(
            command(dir.path(), "x", "touch unexpected"),
            "../escape",
            "value",
        ),
        p::output(
            command(dir.path(), "x", "touch unexpected"),
            "value",
            "../escape",
        ),
        p::retry(command(dir.path(), "x", "touch unexpected"), 0, 10),
    ] {
        assert!(p::plan(vec![task]).validate().is_err());
    }
    assert!(!dir.path().join("unexpected").exists());
}
#[test]
fn cached_products_are_republished_and_retry_uses_one_verified_action() {
    use fluentci_executor::cache::CachePolicy;
    let dir = tempfile::tempdir().unwrap();
    let task = p::cache(p::artifact(p::output(p::retry(command(dir.path(), "build", "if test ! -f marker; then touch marker; exit 7; fi; printf version > value"), 2, 10), "version", "value"), "binary", "value"), CachePolicy { inputs: vec![], outputs: vec!["value".into()], toolchain: "workflow-v1".into(), relocatable: false, toolchain_files: vec![] });
    let mut plan = p::plan(vec![task]);
    plan.cache_dir = Some(dir.path().join("cache"));
    let first = plan
        .execute(&dir.path().join("first"), &Cancellation::default())
        .unwrap();
    assert!(first.success(), "{first:?}");
    fs::remove_file(dir.path().join("value")).unwrap();
    let warm = plan
        .execute(&dir.path().join("warm"), &Cancellation::default())
        .unwrap();
    assert!(warm.success(), "{warm:?}");
    assert_eq!(warm.tasks[0].cache.outcome, "hit");
    assert_eq!(warm.tasks[0].outputs["version"], "version");
    assert_eq!(
        fs::read_to_string(&warm.tasks[0].artifacts["binary"].path).unwrap(),
        "version"
    );
}

#[test]
fn process_failure_preserves_code_stderr_and_structured_event_diagnostics() {
    let dir = tempfile::tempdir().unwrap();
    let plan = p::plan(vec![command(
        dir.path(),
        "compiler",
        "printf 'actual compiler error\\n' >&2; exit 23",
    )]);
    let report = plan
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert_eq!(report.tasks[0].exit_code, Some(23));
    assert!(report.tasks[0]
        .error
        .as_deref()
        .unwrap()
        .contains("actual compiler error"));
    assert_eq!(report.failure().unwrap().exit_code, 23);
    let events = fs::read_to_string(dir.path().join("run/events.jsonl")).unwrap();
    let failure = events
        .lines()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
        .find(|event| event["type"] == "task_state" && event["status"] == "failed")
        .unwrap();
    assert_eq!(failure["exit_code"], 23);
    assert!(failure["error"]
        .as_str()
        .unwrap()
        .contains("actual compiler error"));
    let decoded: fluentci_executor::RunResult =
        serde_json::from_slice(&fs::read(dir.path().join("run/result.json")).unwrap()).unwrap();
    assert_eq!(decoded.failure().unwrap().exit_code, 23);
}
#[test]
fn signal_termination_reports_the_signal_and_is_not_retried() {
    let dir = tempfile::tempdir().unwrap();
    let report = p::plan(vec![p::retry(
        command(dir.path(), "signal", "kill -TERM $$"),
        3,
        10,
    )])
    .execute(&dir.path().join("run"), &Cancellation::default())
    .unwrap();
    assert_eq!(report.tasks[0].signal, Some(15));
    assert_eq!(report.tasks[0].exit_code, Some(143));
    assert_eq!(report.tasks[0].attempts.len(), 1);
    assert!(report.tasks[0]
        .error
        .as_deref()
        .unwrap()
        .contains("signal 15"));
    assert_eq!(report.failure().unwrap().exit_code, 143);
}

#[test]
fn incremental_allowed_failures_release_dependents_after_publication_failure() {
    for allowed in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let producer = p::allow_failure(
            p::output(
                command(dir.path(), "produce", "printf ready"),
                "value",
                "missing-output",
            ),
            allowed,
        );
        let consumer = p::needs(
            command(dir.path(), "consume", "touch consumed"),
            vec![producer.id.clone()],
        );
        let report = p::plan(vec![producer, consumer])
            .compile()
            .unwrap()
            .execute(&dir.path().join("run"), &Cancellation::default())
            .unwrap();
        assert_eq!(report.tasks[0].status, Status::Failed);
        assert_eq!(report.success(), allowed, "{report:?}");
        assert_eq!(dir.path().join("consumed").exists(), allowed);
    }
}

#[test]
fn incremental_publication_and_output_bindings_work_across_reused_runs() {
    let dir = tempfile::tempdir().unwrap();
    let mut tasks = vec![];
    for index in 0..24 {
        let filename = format!("value-{index}");
        let producer = p::artifact(
            p::output(
                command(
                    dir.path(),
                    &format!("producer-{index}"),
                    &format!("printf literal-{index} > {filename}"),
                ),
                "value",
                &filename,
            ),
            "copy",
            &filename,
        );
        let consumer = p::output_env(
            command(
                dir.path(),
                &format!("consumer-{index}"),
                "printf '%s' \"$VALUE\"",
            ),
            "VALUE",
            &producer,
            "value",
        );
        tasks.extend([producer, consumer]);
    }
    let compiled = p::jobs(p::plan(tasks), 3).compile().unwrap();
    for round in 0..2 {
        let report = compiled
            .execute(
                &dir.path().join(format!("run-{round}")),
                &Cancellation::default(),
            )
            .unwrap();
        assert!(report.success(), "{report:?}");
        for index in 0..24 {
            let producer = &report.tasks[2 * index];
            let consumer = &report.tasks[2 * index + 1];
            let expected = format!("literal-{index}");
            assert_eq!(producer.outputs["value"], expected);
            assert_eq!(
                fs::read_to_string(&producer.artifacts["copy"].path).unwrap(),
                expected
            );
            assert_eq!(fs::read_to_string(&consumer.stdout).unwrap(), expected);
        }
    }
}
