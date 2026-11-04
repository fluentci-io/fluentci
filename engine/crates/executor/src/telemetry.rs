//! Provider-neutral tracing. Exporters belong to the host, never the scheduler.
use crate::{Status, Task, TaskResult};
use opentelemetry::{
    global,
    trace::{Status as SpanStatus, TraceContextExt, Tracer},
    Context, KeyValue,
};
use std::{collections::HashMap, time::Instant};

pub(crate) struct Telemetry {
    run: Context,
    steps: Vec<Context>,
    ended: Vec<bool>,
    started: Instant,
    dispatched: Vec<bool>,
    finished: bool,
}
impl Telemetry {
    pub fn new(tasks: &[Task]) -> Self {
        let tracer = global::tracer("fluentci-executor");
        let run = Context::current_with_span(tracer.start("pipeline.run"));
        run.span()
            .set_attribute(KeyValue::new("pipeline.task_count", tasks.len() as i64));
        let steps: Vec<_> = tasks
            .iter()
            .map(|task| {
                let span = tracer.start_with_context("pipeline.step", &run);
                let cx = run.with_span(span);
                cx.span()
                    .set_attribute(KeyValue::new("pipeline.step.id", task.id.clone()));
                cx.span().set_attribute(KeyValue::new(
                    "pipeline.step.kind",
                    if task.file_operation.is_some() {
                        "file"
                    } else {
                        "process"
                    },
                ));
                cx.span().set_attribute(KeyValue::new(
                    "pipeline.step.service",
                    task.service.is_some(),
                ));
                cx
            })
            .collect();
        let indices: HashMap<_, _> = tasks
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();
        for (i, task) in tasks.iter().enumerate() {
            for dependency in &task.needs {
                if let Some(&p) = indices.get(dependency.as_str()) {
                    steps[i].span().add_event(
                        "dependency",
                        vec![
                            KeyValue::new("pipeline.dependency.id", dependency.clone()),
                            KeyValue::new(
                                "pipeline.dependency.span_id",
                                steps[p].span().span_context().span_id().to_string(),
                            ),
                        ],
                    );
                }
            }
        }
        Self {
            run,
            steps,
            ended: vec![false; tasks.len()],
            dispatched: vec![false; tasks.len()],
            started: Instant::now(),
            finished: false,
        }
    }
    pub fn step_context(&self, index: usize) -> Context {
        self.steps[index].clone()
    }
    pub fn ids(&self, index: Option<usize>) -> (Option<String>, Option<String>) {
        let cx = index.map_or(&self.run, |i| &self.steps[i]);
        let span = cx.span();
        let sc = span.span_context();
        if sc.is_valid() {
            (
                Some(sc.trace_id().to_string()),
                Some(sc.span_id().to_string()),
            )
        } else {
            (None, None)
        }
    }
    pub fn update(&mut self, i: usize, result: &TaskResult) {
        if self.ended[i] {
            return;
        }
        let span = self.steps[i].span();
        if !self.dispatched[i] && result.status != Status::Pending {
            self.dispatched[i] = true;
            let wait = self
                .started
                .elapsed()
                .as_millis()
                .saturating_sub(result.duration_ms);
            span.set_attribute(KeyValue::new(
                "pipeline.queue.duration_ms",
                wait.min(i64::MAX as u128) as i64,
            ));
        }
        span.set_attribute(KeyValue::new(
            "pipeline.step.status",
            format!("{:?}", result.status).to_lowercase(),
        ));
        span.set_attribute(KeyValue::new(
            "pipeline.cache.outcome",
            result.cache.outcome.clone(),
        ));
        if matches!(result.status, Status::Ready | Status::Stopping) {
            span.add_event(
                if result.status == Status::Ready {
                    "service.ready"
                } else {
                    "service.stopping"
                },
                vec![KeyValue::new(
                    "service.elapsed_ms",
                    result.duration_ms.min(i64::MAX as u128) as i64,
                )],
            );
        }
        span.set_attribute(KeyValue::new(
            "pipeline.resource.waiting",
            result.wait_reason.is_some(),
        ));
        if result.wait_reason.is_some() && result.status == Status::Pending {
            span.add_event("resource.wait", Vec::new());
        }
        if result.status.terminal() {
            span.set_attribute(KeyValue::new(
                "pipeline.execution.duration_ms",
                result.duration_ms.min(i64::MAX as u128) as i64,
            ));
            if let Some(code) = result.exit_code {
                span.set_attribute(KeyValue::new("process.exit.code", code as i64));
            }
            span.set_status(if result.status == Status::Succeeded {
                SpanStatus::Ok
            } else {
                SpanStatus::error(format!("{:?}", result.status))
            });
            span.end();
            self.ended[i] = true;
        }
    }
    pub fn finish(&mut self, success: bool) {
        self.run.span().set_status(if success {
            SpanStatus::Ok
        } else {
            SpanStatus::error("pipeline did not succeed")
        });
        self.run.span().end();
        self.finished = true;
    }
}
impl Drop for Telemetry {
    fn drop(&mut self) {
        for (i, cx) in self.steps.iter().enumerate() {
            if !self.ended[i] {
                cx.span()
                    .set_status(SpanStatus::error("executor interrupted"));
                cx.span().end();
            }
        }
        if !self.finished {
            self.run
                .span()
                .set_status(SpanStatus::error("executor interrupted"));
            self.run.span().end();
        }
    }
}

/// One supervised probe attempt. Attributes deliberately omit command, paths,
/// environment, output, and OS error text. Dropping an unfinished attempt records
/// cancellation, including executor error/unwind paths.
pub(crate) struct ProbeSpan {
    context: Option<Context>,
    started: Instant,
}
impl ProbeSpan {
    pub fn new(parent: &Context, phase: &'static str) -> Self {
        let span = global::tracer("fluentci-executor")
            .start_with_context("pipeline.service.probe", parent);
        let context = parent.with_span(span);
        context
            .span()
            .set_attribute(KeyValue::new("pipeline.probe.phase", phase));
        Self {
            context: Some(context),
            started: Instant::now(),
        }
    }

    pub fn finish(&mut self, outcome: &'static str, exit_code: Option<i32>) {
        if let Some(context) = self.context.take() {
            let span = context.span();
            span.set_attribute(KeyValue::new("pipeline.probe.outcome", outcome));
            span.set_attribute(KeyValue::new(
                "pipeline.probe.duration_ms",
                self.started.elapsed().as_millis().min(i64::MAX as u128) as i64,
            ));
            if let Some(code) = exit_code {
                span.set_attribute(KeyValue::new("process.exit.code", code as i64));
            }
            span.set_status(if outcome == "succeeded" {
                SpanStatus::Ok
            } else {
                SpanStatus::error(outcome)
            });
            span.end();
        }
    }
}
impl Drop for ProbeSpan {
    fn drop(&mut self) {
        self.finish("cancelled", None);
    }
}
