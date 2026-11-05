use anyhow::Error;
use console::Console;
use fluentci_types::Output;
use std::{
    io::{BufRead, BufReader},
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
    thread,
};

mod console;

pub mod archive;
pub mod bootstrap;
pub mod bsd;
pub mod cache;
pub mod devbox;
pub mod devenv;
pub mod envhub;
pub mod flox;
pub mod git;
pub mod git_checkout;
pub mod git_last_commit;
pub mod hash;
pub mod hermit;
pub mod homebrew;
pub mod http;
pub mod macports;
pub mod mise;
pub mod nix;
pub mod pixi;
pub mod pkgx;
pub mod proto;
pub mod runner;
pub mod service;
pub mod worker;

pub trait Extension {
    /// Serializable provider configuration, never an alternate scheduling path.
    fn worker_spec(&self) -> Result<worker::Provider, Error> {
        Err(anyhow::anyhow!(
            "extension must implement worker_spec for executor-managed execution"
        ))
    }

    fn exec(
        &mut self,
        cmd: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error>;
    fn setup(&self) -> Result<(), Error>;
    fn post_setup(&self, tx: Sender<String>) -> Result<ExitStatus, Error> {
        tx.send("".into())?;
        Ok(ExitStatus::default())
    }
    fn format_command(&self, cmd: &str) -> String {
        cmd.to_string()
    }
}

pub fn exec(
    cmd: &str,
    tx: Sender<String>,
    out: Output,
    last_cmd: bool,
    work_dir: &str,
) -> Result<ExitStatus, Error> {
    exec_with_shell("bash", cmd, tx, out, last_cmd, work_dir)
}

pub(crate) fn exec_with_shell(
    shell: &str,
    cmd: &str,
    tx: Sender<String>,
    out: Output,
    last_cmd: bool,
    work_dir: &str,
) -> Result<ExitStatus, Error> {
    exec_command(Command::new(shell), cmd, tx, out, last_cmd, work_dir)
}

pub(crate) fn exec_with_env(
    cmd: &str,
    tx: Sender<String>,
    out: Output,
    last_cmd: bool,
    work_dir: &str,
    environment: &[(&str, &str)],
) -> Result<ExitStatus, Error> {
    let mut command = Command::new("bash");
    command.envs(environment.iter().copied());
    exec_command(command, cmd, tx, out, last_cmd, work_dir)
}

fn exec_command(
    mut command: Command,
    cmd: &str,
    tx: Sender<String>,
    out: Output,
    last_cmd: bool,
    work_dir: &str,
) -> Result<ExitStatus, Error> {
    let mut child = command
        .arg("-c")
        .arg(cmd)
        .current_dir(work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    worker::command_started()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow::anyhow!("missing stdout pipe"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow::anyhow!("missing stderr pipe"))?;
    let namespace = cmd.to_string();
    let stdout_namespace = namespace.clone();
    let stdout = thread::spawn(move || -> Result<String, Error> {
        let mut console = Console::new(&stdout_namespace);
        let mut captured = String::new();
        for line in BufReader::new(stdout).lines() {
            let line = line?;
            if let Some(renderer) = &mut console {
                if renderer.line(&line).is_err() {
                    console = None;
                    println!("{line}");
                }
            } else {
                println!("{line}");
            }
            let _ = fluentci_logging::info(&line, &stdout_namespace);
            if last_cmd {
                captured.push_str(&line);
                captured.push('\n');
            }
        }
        if let Some(mut renderer) = console {
            let _ = renderer.finish();
        }
        Ok(captured)
    });
    let stderr = thread::spawn(move || -> Result<String, Error> {
        let mut captured = String::new();
        for line in BufReader::new(stderr).lines() {
            let line = line?;
            eprintln!("{line}");
            let _ = fluentci_logging::info(&line, &namespace);
            if last_cmd {
                captured.push_str(&line);
                captured.push('\n');
            }
        }
        Ok(captured)
    });
    let status = child.wait();
    // Both pipe readers are joined before returning or allowing the worker process
    // to exit; final output cannot race the completion/capture notification.
    let stdout = stdout
        .join()
        .map_err(|_| anyhow::anyhow!("stdout reader panicked"));
    let stderr = stderr
        .join()
        .map_err(|_| anyhow::anyhow!("stderr reader panicked"));
    let stdout = stdout??;
    let stderr = stderr??;
    if last_cmd {
        tx.send(if out == Output::Stdout {
            stdout
        } else {
            stderr
        })?;
    }
    Ok(status?)
}
