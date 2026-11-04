//! Child processes use argument vectors, never interpolated shell commands.
use anyhow::{Context, Result, bail};
use std::{
    ffi::OsStr,
    path::Path,
    process::{ExitStatus, Stdio},
};
use tokio::process::Command;

pub async fn run(command: &mut Command) -> Result<()> {
    command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);
    let description = format!("{command:?}");
    let mut child = command
        .spawn()
        .with_context(|| format!("Could not start {description}"))?;
    tokio::select! {
        status=child.wait()=> { let status=status?; if !status.success() { return Err(Failure {program:description,status}.into()); } }
        _=tokio::signal::ctrl_c()=> { child.kill().await?; bail!("Interrupted"); }
    }
    Ok(())
}
pub async fn execute<I, S>(program: &str, args: I, cwd: &Path) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run(Command::new(program).args(args).current_dir(cwd)).await
}

#[derive(Debug)]
pub struct Failure {
    pub program: String,
    pub status: ExitStatus,
}
impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} exited with {}", self.program, self.status)
    }
}
impl std::error::Error for Failure {}
