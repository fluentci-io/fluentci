//! Private provider subprocess protocol. Provider setup cannot mutate the host server.
use crate::Extension;
use anyhow::{bail, Context, Error};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "provider", rename_all = "snake_case", deny_unknown_fields)]
pub enum Provider {
    Runner,
    Nix {
        impure: bool,
    },
    Flox,
    Devbox,
    Devenv,
    Proto,
    Mise,
    Pixi,
    Pkgx,
    Hermit,
    Envhub,
    Homebrew,
    Macports {
        rust: bool,
        executable: PathBuf,
    },
    Bsd {
        manager: String,
        executable: PathBuf,
    },
    Git,
    GitCheckout,
    GitLastCommit,
    Http,
    Cache,
    Zip,
    Unzip,
    TarCzvf,
    TarXzvf,
    Md5,
    Sha256,
    Service,
}
impl Provider {
    pub fn extension(&self) -> Result<Box<dyn Extension + Send + Sync>, Error> {
        Ok(match self {
            Self::Runner => Box::new(crate::runner::Runner::default()),
            Self::Nix { impure } => Box::new(crate::nix::Nix::new(fluentci_types::nix::NixArgs {
                impure: *impure,
            })),
            Self::Flox => Box::new(crate::flox::Flox::default()),
            Self::Devbox => Box::new(crate::devbox::Devbox::default()),
            Self::Devenv => Box::new(crate::devenv::Devenv::default()),
            Self::Proto => Box::new(crate::proto::Proto::default()),
            Self::Mise => Box::new(crate::mise::Mise::default()),
            Self::Pixi => Box::new(crate::pixi::Pixi::default()),
            Self::Pkgx => Box::new(crate::pkgx::Pkgx::default()),
            Self::Hermit => Box::new(crate::hermit::Hermit::default()),
            Self::Envhub => Box::new(crate::envhub::Envhub::default()),
            Self::Homebrew => Box::new(crate::homebrew::Homebrew),
            Self::Macports { rust, executable } => Box::new(
                crate::macports::MacPorts::new(if *rust {
                    crate::macports::MacPortsBackend::Rust
                } else {
                    crate::macports::MacPortsBackend::Native
                })
                .with_executable(executable),
            ),
            Self::Bsd {
                manager,
                executable,
            } => Box::new(
                crate::bsd::BsdPackages::new(match manager.as_str() {
                    "freebsd" => crate::bsd::BsdManager::FreeBsd,
                    "netbsd" => crate::bsd::BsdManager::NetBsd,
                    "openbsd" => crate::bsd::BsdManager::OpenBsd,
                    _ => bail!("unknown BSD provider"),
                })
                .with_executable(executable),
            ),
            Self::Git => Box::new(crate::git::Git::default()),
            Self::GitCheckout => Box::new(crate::git_checkout::GitCheckout::default()),
            Self::GitLastCommit => Box::new(crate::git_last_commit::GitLastCommit::default()),
            Self::Http => Box::new(crate::http::Http::default()),
            Self::Cache => Box::new(crate::cache::Cache::default()),
            Self::Zip => Box::new(crate::archive::zip::Zip::default()),
            Self::Unzip => Box::new(crate::archive::unzip::Unzip::default()),
            Self::TarCzvf => Box::new(crate::archive::tar::czvf::TarCzvf::default()),
            Self::TarXzvf => Box::new(crate::archive::tar::xzvf::TarXzvf::default()),
            Self::Md5 => Box::new(crate::hash::md5::Md5::default()),
            Self::Sha256 => Box::new(crate::hash::sha256::Sha256::default()),
            Self::Service => bail!("process-compose services must be lowered to executor services"),
        })
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Command {
    pub provider: Provider,
    pub command: String,
    pub cwd: PathBuf,
    #[serde(default)]
    pub stderr: bool,
    #[serde(default)]
    pub capture: Option<PathBuf>,
    #[serde(default)]
    pub finalize: bool,
    #[serde(default)]
    pub activate_env: bool,
    #[serde(default)]
    pub started: Option<PathBuf>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub commands: Vec<Command>,
}
impl Request {
    pub fn execute(&self) -> Result<(), Error> {
        if self.version != 1 || self.commands.is_empty() {
            bail!("invalid provider worker request");
        }
        // Reject the complete request before executing its first operation.
        for command in &self.commands {
            if !command.cwd.is_absolute() || !command.cwd.is_dir() {
                bail!("provider cwd must be an existing absolute directory");
            }
            if command
                .capture
                .as_ref()
                .is_some_and(|path| !path.is_absolute())
                || command
                    .started
                    .as_ref()
                    .is_some_and(|path| !path.is_absolute())
            {
                bail!("provider output paths must be absolute");
            }
            let _ = command.provider.extension()?;
        }
        for command in &self.commands {
            // Filesystem-based helpers use relative paths too. This is a dedicated
            // child process, never the multithreaded API server.
            std::env::set_current_dir(&command.cwd)?;
            let cwd = command
                .cwd
                .to_str()
                .context("non-UTF-8 provider working directory")?;
            let (tx, rx) = mpsc::channel();
            let status = if command.activate_env {
                {
                    let provider = crate::envhub::Envhub::default();
                    provider.setup()?;
                    provider.r#use(&command.command, cwd)?
                }
            } else if command.finalize {
                match command.provider {
                    Provider::Cache => {
                        crate::cache::Cache::mounted(&command.command, &command.cwd)?
                            .post_setup(tx)?
                    }
                    _ => bail!("unsupported provider finalizer"),
                }
            } else {
                let mut provider = command.provider.extension()?;
                provider.setup()?;
                STARTED_FILE.with(|file| *file.borrow_mut() = command.started.clone());
                provider.exec(
                    &command.command,
                    tx,
                    if command.stderr {
                        fluentci_types::Output::Stderr
                    } else {
                        fluentci_types::Output::Stdout
                    },
                    command.capture.is_some(),
                    cwd,
                )?
            };
            if !status.success() {
                return Err(command_failure(&status, "provider command failed"));
            }
            if let Some(path) = &command.capture {
                let text = rx.recv().context("provider returned no captured output")?;
                fs::write(path, text)?;
            }
        }
        Ok(())
    }
}
/// Typed subprocess failure so wrappers preserve the original status.
#[derive(Debug)]
pub struct CommandFailure {
    pub exit_code: i32,
    pub message: String,
}
impl std::fmt::Display for CommandFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}
impl std::error::Error for CommandFailure {}
pub fn command_failure(status: &std::process::ExitStatus, phase: impl Into<String>) -> Error {
    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt;
    let exit_code = status.code().unwrap_or_else(|| {
        #[cfg(unix)]
        {
            if let Some(signal) = status.signal() {
                return 128 + signal;
            }
        }
        1
    });
    CommandFailure {
        exit_code,
        message: format!("{} (exit code {exit_code}; {status})", phase.into()),
    }
    .into()
}
pub fn output_failure(output: &std::process::Output, phase: impl Into<String>) -> Error {
    let stderr =
        String::from_utf8_lossy(&output.stderr[output.stderr.len().saturating_sub(4096)..]);
    command_failure(
        &output.status,
        format!("{}: {}", phase.into(), stderr.trim()),
    )
}

pub fn run(path: &Path) -> Result<(), Error> {
    let request: Request = serde_json::from_slice(&fs::read(path)?)?;
    request.execute()
}

thread_local! { static STARTED_FILE: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) }; }
pub(crate) fn command_started() -> Result<(), Error> {
    STARTED_FILE.with(|file| {
        if let Some(path) = file.borrow_mut().take() {
            fs::write(path, b"started")?;
        }
        Ok(())
    })
}
