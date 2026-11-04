//! Readiness and health probes run as supervised children, never in the scheduler thread.
use crate::{telemetry::ProbeSpan, Running, Status, Task};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    ffi::OsString,
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Service {
    pub readiness: Probe,
    /// Optional recurring check after readiness; defaults to the readiness probe.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub health: Option<Probe>,
    #[serde(default = "startup_timeout")]
    pub startup_timeout_ms: u64,
    #[serde(default = "shutdown_timeout")]
    pub shutdown_timeout_ms: u64,
    #[serde(default = "failure_threshold")]
    pub failure_threshold: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Probe {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "probe_interval")]
    pub interval_ms: u64,
    #[serde(default = "probe_timeout")]
    pub timeout_ms: u64,
}
fn startup_timeout() -> u64 {
    30_000
}
fn shutdown_timeout() -> u64 {
    5_000
}
fn failure_threshold() -> usize {
    3
}
fn probe_interval() -> u64 {
    250
}
fn probe_timeout() -> u64 {
    1_000
}
impl Service {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.readiness.program.is_empty()
            || self.startup_timeout_ms == 0
            || self.shutdown_timeout_ms == 0
            || self.readiness.interval_ms == 0
            || self.readiness.timeout_ms == 0
            || self.health.as_ref().is_some_and(|probe| {
                probe.program.is_empty() || probe.interval_ms == 0 || probe.timeout_ms == 0
            })
            || self.failure_threshold == 0
        {
            return Err("service requires a probe and positive lifecycle limits".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ProbeLogs {
    pub stdout: PathBuf,
    pub stderr: PathBuf,
}

pub(crate) enum Health {
    Waiting,
    Ready,
    Failed(String),
}
pub(crate) struct Supervisor {
    probe: Option<Running>,
    probe_span: Option<ProbeSpan>,
    context: opentelemetry::Context,
    next: Instant,
    failures: usize,
    last_failure: Option<String>,
    pub ready: bool,
    logs: ProbeLogs,
}
impl Supervisor {
    pub fn new(logs: ProbeLogs, context: opentelemetry::Context) -> Self {
        Self {
            probe: None,
            probe_span: None,
            context,
            next: Instant::now(),
            failures: 0,
            last_failure: None,
            ready: false,
            logs,
        }
    }
    pub fn last_failure(&self) -> Option<&str> {
        self.last_failure.as_deref()
    }
    pub fn stop(&mut self) {
        self.probe.take();
        self.probe_span.take();
    }
    pub fn poll(&mut self, task: &Task, inherited: &BTreeMap<OsString, OsString>) -> Health {
        let config = task.service.as_ref().expect("service configuration");
        let check = if self.ready {
            config.health.as_ref().unwrap_or(&config.readiness)
        } else {
            &config.readiness
        };
        let phase = if self.ready { "health" } else { "readiness" };
        if let Some(probe) = &mut self.probe {
            let outcome = match probe.child.as_mut().expect("probe process").try_wait() {
                Ok(Some(status)) if status.success() => Some((Ok(()), "succeeded", status.code())),
                Ok(Some(status)) => Some((
                    Err(format!("{phase} probe exited with {status}")),
                    "failed",
                    status.code(),
                )),
                Ok(None) if probe.started.elapsed() < Duration::from_millis(check.timeout_ms) => {
                    None
                }
                Ok(None) => Some((
                    Err(format!(
                        "{phase} probe timed out after {} ms",
                        check.timeout_ms
                    )),
                    "timed_out",
                    None,
                )),
                Err(error) => Some((
                    Err(format!("could not wait for {phase} probe: {error}")),
                    "wait_error",
                    None,
                )),
            };
            if let Some((outcome, label, code)) = outcome {
                self.probe.take();
                if let Some(mut span) = self.probe_span.take() {
                    span.finish(label, code);
                }
                let next_check = if outcome.is_ok() {
                    config.health.as_ref().unwrap_or(&config.readiness)
                } else {
                    check
                };
                self.next = Instant::now() + Duration::from_millis(next_check.interval_ms);
                match outcome {
                    Ok(()) => {
                        self.failures = 0;
                        self.last_failure = None;
                        if !self.ready {
                            self.ready = true;
                            return Health::Ready;
                        }
                    }
                    Err(reason) => {
                        self.failures = self.failures.saturating_add(1);
                        self.last_failure = Some(reason.clone());
                        if self.ready && self.failures >= config.failure_threshold {
                            return Health::Failed(format!(
                                "service health probe failure threshold reached ({} consecutive failures): {reason}",
                                self.failures
                            ));
                        }
                    }
                }
            }
        } else if Instant::now() >= self.next {
            let mut span = ProbeSpan::new(&self.context, phase);
            let open = |path: &PathBuf| -> Result<_, std::io::Error> {
                let mut file = OpenOptions::new().create(true).append(true).open(path)?;
                writeln!(file, "--- {phase} probe ---")?;
                Ok(file)
            };
            let streams = open(&self.logs.stdout)
                .and_then(|stdout| open(&self.logs.stderr).map(|stderr| (stdout, stderr)));
            let (stdout, stderr) = match streams {
                Ok(streams) => streams,
                Err(error) => {
                    span.finish("log_error", None);
                    return Health::Failed(format!("could not open {phase} probe logs: {error}"));
                }
            };
            let mut command = Command::new(&check.program);
            command
                .args(&check.args)
                .current_dir(&task.cwd)
                .env_clear()
                .envs(inherited)
                .envs(&task.env)
                .stdin(Stdio::null())
                .stdout(Stdio::from(stdout))
                .stderr(Stdio::from(stderr));
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                command.process_group(0);
            }
            match command.spawn() {
                Ok(child) => {
                    self.probe_span = Some(span);
                    self.probe = Some(Running {
                        index: usize::MAX,
                        child: Some(child),
                        native: None,
                        started: Instant::now(),
                        attempt_started: Instant::now(),
                        leases: None,
                        action: None,
                    })
                }
                Err(error) => {
                    span.finish("spawn_error", None);
                    return Health::Failed(format!("could not spawn {phase} probe: {error}"));
                }
            }
        }
        Health::Waiting
    }
}

impl Drop for Supervisor {
    fn drop(&mut self) {
        // Child/process-group cleanup precedes ending the active probe span.
        self.stop();
    }
}

pub(crate) struct Shutdown {
    pub started: Option<Instant>,
    pub status: Status,
    pub error: Option<String>,
}
