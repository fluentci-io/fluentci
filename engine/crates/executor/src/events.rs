//! Durable, ordered execution events. UI consumers tail this journal rather than
//! placing terminal rendering or network backpressure on the scheduler.
use crate::{telemetry::Telemetry, Status, Task, TaskResult};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    io::{BufWriter, Read, Seek, SeekFrom, Write},
    path::Path,
    time::Instant,
};

#[derive(Debug, Deserialize, Serialize)]
pub struct Event {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub span_id: Option<String>,
    pub sequence: u64,
    pub elapsed_ms: u64,
    #[serde(flatten)]
    pub kind: EventKind,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventKind {
    RunStarted {
        tasks: usize,
    },
    TaskState {
        id: String,
        status: Status,
        cache: String,
        reason: String,
        #[serde(default)]
        wait_reason: Option<String>,
        error: Option<String>,
        #[serde(default)]
        exit_code: Option<i32>,
        #[serde(default)]
        signal: Option<i32>,
        duration_ms: u64,
    },
    Log {
        id: String,
        stream: String,
        text: String,
    },
    RunFinished {
        success: bool,
    },
}

pub(crate) struct Journal {
    telemetry: Telemetry,
    task_ids: HashMap<String, usize>,
    writer: BufWriter<File>,
    started: Instant,
    sequence: u64,
    states: Vec<(Status, String, Option<String>)>,
    offsets: Vec<[u64; 4]>,
    // Terminal streams reaching EOF no longer need polling on ordinary ticks.
    // The final drain rechecks them once more before the run-finished event.
    drained: Vec<[bool; 4]>,
}
impl Journal {
    pub fn new(path: &Path, tasks: &[Task]) -> Result<Self, String> {
        let count = tasks.len();
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|e| e.to_string())?;
        let mut journal = Self {
            telemetry: Telemetry::new(tasks),
            task_ids: tasks
                .iter()
                .enumerate()
                .map(|(i, t)| (t.id.clone(), i))
                .collect(),
            writer: BufWriter::new(file),
            started: Instant::now(),
            sequence: 0,
            states: vec![(Status::Pending, String::new(), None); count],
            offsets: vec![[0; 4]; count],
            drained: vec![[false; 4]; count],
        };
        journal.emit(EventKind::RunStarted { tasks: count })?;
        journal.writer.flush().map_err(|e| e.to_string())?;
        Ok(journal)
    }
    pub fn step_context(&self, index: usize) -> opentelemetry::Context {
        self.telemetry.step_context(index)
    }
    fn emit(&mut self, kind: EventKind) -> Result<(), String> {
        let index = match &kind {
            EventKind::TaskState { id, .. } | EventKind::Log { id, .. } => {
                self.task_ids.get(id).copied()
            }
            _ => None,
        };
        let (trace_id, span_id) = self.telemetry.ids(index);
        let event = Event {
            trace_id,
            span_id,
            sequence: self.sequence,
            elapsed_ms: self.started.elapsed().as_millis().min(u64::MAX as u128) as u64,
            kind,
        };
        self.sequence += 1;
        serde_json::to_writer(&mut self.writer, &event).map_err(|e| e.to_string())?;
        self.writer.write_all(b"\n").map_err(|e| e.to_string())
    }
    pub fn update(
        &mut self,
        results: &[TaskResult],
        order: &[usize],
        drain: bool,
    ) -> Result<(), String> {
        for &i in order {
            let result = &results[i];
            for (stream, path) in [
                Some(("stdout", &result.stdout)),
                Some(("stderr", &result.stderr)),
                result
                    .probe_logs
                    .as_ref()
                    .map(|logs| ("probe_stdout", &logs.stdout)),
                result
                    .probe_logs
                    .as_ref()
                    .map(|logs| ("probe_stderr", &logs.stderr)),
            ]
            .into_iter()
            .enumerate()
            {
                let Some(path) = path else { continue };
                // A rejected restore can replace/remove these files before spawn.
                // Do not emit tentative logs or advance their cursors.
                if result.status == Status::Pending
                    || result.cache.outcome == "preparing"
                    || (self.drained[i][stream] && !drain)
                {
                    continue;
                }
                let mut file = match File::open(path.1) {
                    Ok(f) => f,
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                        self.drained[i][stream] = result.status.terminal();
                        continue;
                    }
                    Err(e) => return Err(e.to_string()),
                };
                file.seek(SeekFrom::Start(self.offsets[i][stream]))
                    .map_err(|e| e.to_string())?;
                // At most 64 KiB per stream per tick; the original log files retain
                // arbitrary binary output. Event text is a lossy UTF-8 display view.
                let mut buffer = [0u8; 16384];
                let mut chunks = 0;
                loop {
                    let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
                    if n == 0 {
                        self.drained[i][stream] = result.status.terminal();
                        break;
                    }
                    self.offsets[i][stream] += n as u64;
                    self.emit(EventKind::Log {
                        id: result.id.clone(),
                        stream: path.0.into(),
                        text: String::from_utf8_lossy(&buffer[..n]).into_owned(),
                    })?;
                    chunks += 1;
                    if !drain && chunks >= 4 {
                        break;
                    }
                }
            }
            let state = (
                result.status.clone(),
                result.cache.outcome.clone(),
                result.wait_reason.clone(),
            );
            if state != self.states[i] {
                self.telemetry.update(i, result);
                self.states[i] = state;
                self.emit(EventKind::TaskState {
                    id: result.id.clone(),
                    status: result.status.clone(),
                    cache: result.cache.outcome.clone(),
                    reason: result.cache.reason.clone(),
                    wait_reason: result.wait_reason.clone(),
                    error: result.error.clone(),
                    exit_code: result.exit_code,
                    signal: result.signal,
                    duration_ms: result.duration_ms.min(u64::MAX as u128) as u64,
                })?;
            }
        }
        self.writer.flush().map_err(|e| e.to_string())
    }
    pub fn finish(&mut self, success: bool) -> Result<(), String> {
        self.telemetry.finish(success);
        self.emit(EventKind::RunFinished { success })?;
        self.writer.flush().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_event_roundtrips_through_the_wire_format() {
        for kind in [
            EventKind::RunStarted { tasks: 2 },
            EventKind::TaskState {
                id: "task".into(),
                status: Status::Running,
                cache: "miss".into(),
                reason: "new action".into(),
                wait_reason: None,
                error: None,
                exit_code: None,
                signal: None,
                duration_ms: 12,
            },
            EventKind::Log {
                id: "task".into(),
                stream: "stdout".into(),
                text: "hello\n".into(),
            },
            EventKind::RunFinished { success: true },
        ] {
            let encoded = serde_json::to_string(&Event {
                trace_id: None,
                span_id: None,
                sequence: 1,
                elapsed_ms: 42,
                kind,
            })
            .unwrap();
            let decoded: Event = serde_json::from_str(&encoded).unwrap();
            assert_eq!(serde_json::to_string(&decoded).unwrap(), encoded);
        }
    }
}

#[cfg(test)]
mod polling_tests {
    use super::*;
    use std::fs;

    fn fixture(root: &Path, count: usize) -> (Vec<Task>, Vec<TaskResult>) {
        let tasks = (0..count)
            .map(|i| {
                serde_json::from_value(serde_json::json!({
                    "id": format!("task-{i}"), "program": "/bin/true", "cwd": root
                }))
                .unwrap()
            })
            .collect::<Vec<Task>>();
        let results = tasks
            .iter()
            .enumerate()
            .map(|(i, task)| TaskResult {
                id: task.id.clone(),
                status: Status::Pending,
                exit_code: None,
                signal: None,
                file_result: None,
                error: None,
                duration_ms: 0,
                stdout: root.join(format!("{i}.stdout")),
                stderr: root.join(format!("{i}.stderr")),
                probe_logs: None,
                cache: crate::cache::CacheResult::disabled(),
                wait_reason: None,
                attempts: vec![],
                outputs: Default::default(),
                artifacts: Default::default(),
                condition_skipped: false,
                allowed_failure: false,
            })
            .collect();
        (tasks, results)
    }

    #[test]
    fn terminal_backlogs_and_later_task_output_are_drained_without_replay() {
        let root = tempfile::tempdir().unwrap();
        let (tasks, mut results) = fixture(root.path(), 2);
        results[0].probe_logs = Some(crate::service::ProbeLogs {
            stdout: root.path().join("probe.stdout"),
            stderr: root.path().join("probe.stderr"),
        });
        let path = root.path().join("events.jsonl");
        let mut journal = Journal::new(&path, &tasks).unwrap();
        journal.update(&results, &[0, 1], false).unwrap();
        // More than a tick's budget on all streams; terminal does not mean drained.
        let large = "x".repeat(150_000);
        for path in [
            &results[0].stdout,
            &results[0].stderr,
            &results[0].probe_logs.as_ref().unwrap().stdout,
            &results[0].probe_logs.as_ref().unwrap().stderr,
        ] {
            fs::write(path, &large).unwrap();
        }
        results[0].status = Status::Succeeded;
        journal.update(&results, &[0, 1], false).unwrap();
        results[1].status = Status::Running;
        fs::write(&results[1].stdout, "first").unwrap();
        journal.update(&results, &[0, 1], false).unwrap();
        OpenOptions::new()
            .append(true)
            .open(&results[1].stdout)
            .unwrap()
            .write_all(b"second")
            .unwrap();
        results[1].status = Status::Succeeded;
        journal.update(&results, &[0, 1], false).unwrap();
        // Even a stream already observed at terminal EOF is rechecked at finish.
        OpenOptions::new()
            .append(true)
            .open(&results[0].stdout)
            .unwrap()
            .write_all(b"late")
            .unwrap();
        journal.update(&results, &[0, 1], true).unwrap();
        journal.update(&results, &[0, 1], true).unwrap();
        journal.finish(true).unwrap();
        let mut captured = std::collections::BTreeMap::<(String, String), String>::new();
        for line in fs::read_to_string(path).unwrap().lines() {
            let event: Event = serde_json::from_str(line).unwrap();
            if let EventKind::Log { id, stream, text } = event.kind {
                captured.entry((id, stream)).or_default().push_str(&text);
            }
        }
        for stream in ["stdout", "stderr", "probe_stdout", "probe_stderr"] {
            let expected = if stream == "stdout" {
                format!("{large}late")
            } else {
                large.clone()
            };
            let actual = captured.get(&("task-0".into(), stream.into())).unwrap();
            assert!(
                actual == &expected,
                "{stream} bytes differ: {} vs {}",
                actual.len(),
                expected.len()
            );
        }
        assert_eq!(
            captured.get(&("task-1".into(), "stdout".into())).unwrap(),
            "firstsecond"
        );
        assert_eq!(captured.len(), 5);
    }

    #[test]
    #[ignore = "release-only journal polling benchmark; no timing threshold"]
    fn inactive_task_polling_benchmark() {
        let root = tempfile::tempdir().unwrap();
        let (tasks, mut results) = fixture(root.path(), 2000);
        for result in results.iter_mut().take(1000) {
            result.status = Status::Succeeded;
            fs::write(&result.stdout, "").unwrap();
            fs::write(&result.stderr, "").unwrap();
        }
        let order = (0..tasks.len()).collect::<Vec<_>>();
        let mut journal = Journal::new(&root.path().join("events.jsonl"), &tasks).unwrap();
        journal.update(&results, &order, false).unwrap();
        for _ in 0..5 {
            let started = Instant::now();
            for _ in 0..20 {
                journal.update(&results, &order, false).unwrap();
            }
            eprintln!(
                "inactive_task_polling seconds={:.6}",
                started.elapsed().as_secs_f64()
            );
        }
    }
}
