#![cfg(unix)]
use fluentci_executor::{Cancellation, Plan};
use opentelemetry::{
    global,
    trace::{TraceContextExt, TraceResult, Tracer, TracerProvider},
    Context,
};
use opentelemetry_sdk::{
    export::trace::SpanData,
    trace::{Span, SpanProcessor},
};
use std::sync::{Arc, Mutex};

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
#[test]
fn each_step_has_parented_correlated_spans_without_sensitive_command_data() {
    let capture = Capture::default();
    let provider = opentelemetry_sdk::trace::TracerProvider::builder()
        .with_span_processor(capture.clone())
        .build();
    global::set_tracer_provider(provider.clone());
    let tracer = provider.tracer("test");
    let parent = Context::current_with_span(tracer.start("request"));
    let _guard = parent.clone().attach();
    let dir = tempfile::tempdir().unwrap();
    let plan: Plan = serde_json::from_value(serde_json::json!({
        "inherit_env": false, "fail_fast": false, "jobs": 2,
        "tasks": [
            {"id":"success", "program":"/bin/sh", "args":["-c", "echo command-secret"], "env":{"SECRET":"environment-secret"}, "cwd":dir.path()},
            {"id":"failure", "program":"/bin/sh", "args":["-c", "exit 7"], "cwd":dir.path()},
            {"id":"skipped", "needs":["failure"], "program":"/bin/echo", "cwd":dir.path()},
            {"id":"service", "program":"/bin/sh", "args":["-c", "trap 'exit 0' TERM; while :; do /bin/sleep 0.02; done"], "cwd":dir.path(), "service":{"readiness":{"program":"/bin/sh", "args":["-c", "echo probe-secret"]}, "shutdown_timeout_ms":100}},
            {"id":"service-consumer", "needs":["service"], "program":"/bin/echo", "cwd":dir.path()}
        ]
    })).unwrap();
    let result = plan
        .execute(&dir.path().join("run"), &Cancellation::default())
        .unwrap();
    assert!(!result.success());
    let spans = capture.0.lock().unwrap();
    assert!(spans.iter().any(|s| s.name == "pipeline.service.probe"));
    assert_eq!(
        spans
            .iter()
            .filter(|s| s.name != "pipeline.service.probe")
            .count(),
        6
    );
    let run = spans.iter().find(|s| s.name == "pipeline.run").unwrap();
    assert_eq!(run.parent_span_id, parent.span().span_context().span_id());
    let steps: Vec<_> = spans.iter().filter(|s| s.name == "pipeline.step").collect();
    assert_eq!(steps.len(), 5);
    for step in &steps {
        assert_eq!(step.parent_span_id, run.span_context.span_id());
        assert_eq!(step.span_context.trace_id(), run.span_context.trace_id());
        assert!(step.end_time >= step.start_time);
    }
    let attributes = format!("{spans:?}");
    assert!(!attributes.contains("command-secret"));
    assert!(!attributes.contains("environment-secret"));
    assert!(!attributes.contains("probe-secret"));
    assert!(attributes.contains("Skipped"));
    assert!(attributes.contains("process.exit.code"));
    assert!(attributes.contains("service.ready"));
    assert!(attributes.contains("service.stopping"));
    let events = std::fs::read_to_string(dir.path().join("run/events.jsonl")).unwrap();
    assert!(events.lines().any(|line| {
        let event: serde_json::Value = serde_json::from_str(line).unwrap();
        event["type"] == "log"
            && event["stream"] == "probe_stdout"
            && event["text"].as_str().unwrap().contains("probe-secret")
    }));
    for line in events.lines() {
        let event: serde_json::Value = serde_json::from_str(line).unwrap();
        assert_eq!(event["trace_id"], run.span_context.trace_id().to_string());
        if let Some(id) = event["id"].as_str() {
            let step = steps
                .iter()
                .find(|s| {
                    s.attributes
                        .iter()
                        .any(|kv| kv.key.as_str() == "pipeline.step.id" && kv.value.as_str() == id)
                })
                .unwrap();
            assert_eq!(event["span_id"], step.span_context.span_id().to_string());
        }
    }
}
