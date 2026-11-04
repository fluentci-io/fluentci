#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan};
use opentelemetry::{
    global,
    trace::{Status as SpanStatus, TraceResult},
    Context,
};
use opentelemetry_sdk::{
    export::trace::SpanData,
    trace::{Span, SpanProcessor},
};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Default)]
struct Capture(Arc<Mutex<Vec<SpanData>>>);
impl SpanProcessor for Capture {
    fn on_start(&self, _: &mut Span, _: &Context) {}
    fn on_end(&self, span: SpanData) {
        self.0.lock().unwrap().push(span);
    }
    fn force_flush(&self) -> TraceResult<()> {
        Ok(())
    }
    fn shutdown(&mut self) -> TraceResult<()> {
        Ok(())
    }
}
fn attribute(span: &SpanData, key: &str) -> Option<String> {
    span.attributes
        .iter()
        .find(|kv| kv.key.as_str() == key)
        .map(|kv| kv.value.to_string())
}

#[test]
fn probe_attempts_end_under_the_service_step_on_success_failure_timeout_and_cancellation() {
    let capture = Capture::default();
    let provider = opentelemetry_sdk::trace::TracerProvider::builder()
        .with_span_processor(capture.clone())
        .build();
    global::set_tracer_provider(provider);
    for case in [
        "retries",
        "timeout",
        "spawn",
        "cancel",
        "health_cancel",
        "service_exit",
    ] {
        capture.0.lock().unwrap().clear();
        let root = tempfile::tempdir().unwrap();
        let readiness = match case {
            "retries" => "echo probe-output-secret; if [ -f attempt ]; then exit 0; else touch attempt; exit 7; fi",
            "cancel" | "service_exit" => "echo started > probe-started; /bin/sleep 20",
            _ => "exit 0",
        };
        let daemon = if case == "service_exit" {
            "while [ ! -f probe-started ]; do /bin/sleep 0.01; done; exit 3"
        } else {
            "trap 'exit 0' TERM; while :; do /bin/sleep 0.02; done"
        };
        let mut plan: Plan = serde_json::from_value(serde_json::json!({
            "jobs":1, "fail_fast":false, "tasks":[
                {"id":"database", "program":"/bin/sh", "args":["-c",daemon], "cwd":root.path(),
                 "timeout_ms":3000, "env":{"SECRET":"environment-secret"},
                 "service":{
                    "readiness":{"program":"/bin/sh","args":["-c",readiness],"interval_ms":10,"timeout_ms":2000},
                    "health":{"program":"/bin/sh","args":["-c",if case == "timeout" { "/bin/sleep 20" } else if case == "health_cancel" { "echo started > probe-started; /bin/sleep 20" } else { "exit 9" }],"interval_ms":10,"timeout_ms":if case == "health_cancel" { 2000 } else { 30 }},
                    "startup_timeout_ms":2000,"shutdown_timeout_ms":100,"failure_threshold":1
                 }},
                {"id":"consumer", "program":"/bin/sleep", "args":["20"], "cwd":root.path(), "needs":["database"],"timeout_ms":3000}
            ]
        })).unwrap();
        if case == "spawn" {
            plan.tasks[0].service.as_mut().unwrap().readiness.program = root
                .path()
                .join("missing-program-secret")
                .to_string_lossy()
                .into_owned();
        }
        let cancel = Cancellation::default();
        let result = std::thread::scope(|scope| {
            if case == "cancel" || case == "health_cancel" {
                let cancel = &cancel;
                let root = root.path();
                scope.spawn(move || {
                    let deadline = Instant::now() + Duration::from_secs(2);
                    while !root.join("probe-started").exists() && Instant::now() < deadline {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    let started = root.join("probe-started").exists();
                    cancel.cancel();
                    assert!(started, "probe must be active before cancellation");
                });
            }
            plan.execute(&root.path().join("run"), &cancel).unwrap()
        });
        assert!(!result.success(), "{case}");
        let spans = capture.0.lock().unwrap();
        let step = spans
            .iter()
            .find(|s| {
                s.name == "pipeline.step"
                    && attribute(s, "pipeline.step.id").as_deref() == Some("database")
            })
            .unwrap();
        let probes: Vec<_> = spans
            .iter()
            .filter(|s| s.name == "pipeline.service.probe")
            .collect();
        let expected: &[(&str, &str, Option<&str>)] = match case {
            "retries" => &[
                ("readiness", "failed", Some("7")),
                ("readiness", "succeeded", Some("0")),
                ("health", "failed", Some("9")),
            ],
            "timeout" => &[
                ("readiness", "succeeded", Some("0")),
                ("health", "timed_out", None),
            ],
            "spawn" => &[("readiness", "spawn_error", None)],
            "health_cancel" => &[
                ("readiness", "succeeded", Some("0")),
                ("health", "cancelled", None),
            ],
            _ => &[("readiness", "cancelled", None)],
        };
        assert_eq!(probes.len(), expected.len(), "{case}: {spans:?}");
        for (probe, (phase, outcome, code)) in probes.iter().zip(expected) {
            assert_eq!(probe.parent_span_id, step.span_context.span_id(), "{case}");
            assert_eq!(probe.span_context.trace_id(), step.span_context.trace_id());
            assert!(probe.start_time >= step.start_time);
            assert!(probe.end_time >= probe.start_time && probe.end_time <= step.end_time);
            assert_eq!(
                attribute(probe, "pipeline.probe.phase").as_deref(),
                Some(*phase)
            );
            assert_eq!(
                attribute(probe, "pipeline.probe.outcome").as_deref(),
                Some(*outcome)
            );
            assert_eq!(attribute(probe, "process.exit.code").as_deref(), *code);
            assert!(attribute(probe, "pipeline.probe.duration_ms")
                .unwrap()
                .parse::<u64>()
                .is_ok());
            if *outcome == "succeeded" {
                assert_eq!(probe.status, SpanStatus::Ok);
            } else {
                assert!(matches!(probe.status, SpanStatus::Error { .. }));
            }
        }
        let exported = format!("{spans:?}");
        for secret in [
            "probe-output-secret",
            "environment-secret",
            "missing-program-secret",
        ] {
            assert!(!exported.contains(secret));
        }
        assert!(!exported.contains(root.path().to_str().unwrap()));
    }
}
