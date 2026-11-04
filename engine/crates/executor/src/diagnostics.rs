//! Structured failure forwarding shared by CLI, host imports and SDK results.
use crate::{RunOutcome, RunResult, Status, TaskResult};
use std::{
    fmt,
    io::{Read, Seek, SeekFrom},
    path::Path,
    process::ExitStatus,
};

#[derive(Clone, Debug)]
pub struct ExecutionFailure {
    pub exit_code: i32,
    pub message: String,
}
impl fmt::Display for ExecutionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
impl std::error::Error for ExecutionFailure {}

pub fn process_exit(status: &ExitStatus) -> (i32, Option<i32>) {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            return (128 + signal, Some(signal));
        }
    }
    (status.code().unwrap_or(1), None)
}
fn tail(path: &Path) -> String {
    let read = (|| -> std::io::Result<String> {
        let mut file = crate::cache::open_storage_file(path)?;
        let size = file.metadata()?.len();
        file.seek(SeekFrom::Start(size.saturating_sub(4096)))?;
        let mut bytes = Vec::new();
        file.take(4096).read_to_end(&mut bytes)?;
        let text: String = String::from_utf8_lossy(&bytes)
            .chars()
            .filter(|c| !c.is_control() || matches!(*c, '\n' | '\t'))
            .collect();
        Ok(if size > 4096 {
            format!("[last 4096 bytes]\n{text}")
        } else {
            text
        })
    })();
    read.unwrap_or_default()
}
pub(crate) fn process_error(
    program: &str,
    code: i32,
    signal: Option<i32>,
    stderr: &Path,
    stdout: &Path,
) -> String {
    let heading = match signal {
        Some(signal) => {
            format!("exit code {code}: process {program} terminated by signal {signal}")
        }
        None => format!("exit code {code}: process {program} failed"),
    };
    with_process_output(heading, stderr, stdout)
}
pub(crate) fn with_process_output(message: String, stderr: &Path, stdout: &Path) -> String {
    let stderr = tail(stderr);
    if !stderr.trim().is_empty() {
        return format!("{message}\nstderr:\n{stderr}");
    }
    let stdout = tail(stdout);
    if !stdout.trim().is_empty() {
        return format!("{message}\nstdout:\n{stdout}");
    }
    message
}
impl RunResult {
    pub fn failure(&self) -> Option<ExecutionFailure> {
        if self.success() {
            return None;
        }
        let task = self
            .tasks
            .iter()
            .find(|task| {
                !task.allowed_failure && matches!(task.status, Status::Failed | Status::TimedOut)
            })
            .or_else(|| {
                self.tasks
                    .iter()
                    .find(|task| task.status == Status::Cancelled)
            });
        let exit_code = if self.outcome == RunOutcome::Cancelled {
            130
        } else {
            task.and_then(|task| task.exit_code)
                .filter(|code| *code != 0)
                .unwrap_or_else(|| {
                    if task.is_some_and(|task| task.status == Status::TimedOut) {
                        124
                    } else {
                        1
                    }
                })
        };
        let message = task
            .map(task_failure)
            .unwrap_or_else(|| format!("pipeline {:?} (exit code {exit_code})", self.outcome));
        Some(ExecutionFailure {
            exit_code,
            message: format!("pipeline failed (exit code {exit_code}): {message}"),
        })
    }
}
pub fn task_failure(task: &TaskResult) -> String {
    let code = task.exit_code.map_or_else(
        || "no process exit code".into(),
        |code| format!("exit code {code}"),
    );
    format!(
        "task {} {:?} ({code}): {}",
        task.id,
        task.status,
        task.error
            .as_deref()
            .unwrap_or("process did not complete successfully")
    )
}
