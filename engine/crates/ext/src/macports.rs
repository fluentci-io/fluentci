//! MacPorts environment adapter for an explicitly provisioned macOS host.
use crate::{exec, homebrew::validate_packages, Extension};
use anyhow::{bail, Error};
use fluentci_types::Output;
use std::{
    path::PathBuf,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MacPortsBackend {
    #[default]
    Native,
    /// https://github.com/tsirysndr/macports-rs (also installs a binary named `port`).
    Rust,
}

pub struct MacPorts {
    backend: MacPortsBackend,
    executable: PathBuf,
}

impl Default for MacPorts {
    fn default() -> Self {
        Self::new(MacPortsBackend::Native)
    }
}

impl MacPorts {
    pub fn new(backend: MacPortsBackend) -> Self {
        let executable = match backend {
            MacPortsBackend::Native => "/opt/local/bin/port",
            MacPortsBackend::Rust => "/usr/local/bin/port",
        };
        Self {
            backend,
            executable: executable.into(),
        }
    }

    /// Select an explicitly installed binary, including PORT_RS_INSTALL_DIR installs.
    pub fn with_executable(mut self, executable: impl Into<PathBuf>) -> Self {
        self.executable = executable.into();
        self
    }

    pub fn executable(&self) -> &std::path::Path {
        &self.executable
    }
    pub fn backend(&self) -> MacPortsBackend {
        self.backend
    }

    pub fn validate_platform(os: &str) -> Result<(), Error> {
        if os != "macos" {
            bail!("MacPorts supports macOS only (got {os})");
        }
        Ok(())
    }

    /// Requires an installation writable by the current user. Privilege elevation
    /// is the caller's responsibility; the engine never invokes sudo implicitly.
    pub fn install(&self, packages: Vec<&str>) -> Result<ExitStatus, Error> {
        validate_packages(&packages)?;
        self.setup()?;
        let status = Command::new(&self.executable)
            .arg("-N")
            .arg("install")
            .args(packages)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()?;
        if !status.success() {
            return Err(crate::worker::command_failure(
                &status,
                "port install failed; check MacPorts prefix permissions",
            ));
        }
        Ok(status)
    }
}

impl Extension for MacPorts {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Macports {
            rust: self.backend == MacPortsBackend::Rust,
            executable: self.executable.clone(),
        })
    }

    fn setup(&self) -> Result<(), Error> {
        Self::validate_platform(std::env::consts::OS)?;
        if !self.executable.is_absolute() || !self.executable.is_file() {
            bail!("MacPorts {:?} backend is not installed at {}. Provision the selected backend explicitly", self.backend, self.executable.display());
        }
        Ok(())
    }
    fn exec(
        &mut self,
        cmd: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;
        exec(&self.format_command(cmd), tx, out, last_cmd, work_dir)
    }
    fn format_command(&self, cmd: &str) -> String {
        if Self::validate_platform(std::env::consts::OS).is_err() {
            return "echo 'MacPorts requires macOS' >&2; exit 1".into();
        }
        let binary = shell_quote(&self.executable.to_string_lossy());
        let parent = shell_quote(
            &self
                .executable
                .parent()
                .unwrap_or(std::path::Path::new("/opt/local/bin"))
                .to_string_lossy(),
        );
        // Pin `port` even when both implementations are installed. This function
        // also supports an explicitly named custom executable.
        format!("export PATH=\"/opt/local/bin:/opt/local/sbin\":{parent}:\"$PATH\"; port() {{ {binary} \"$@\"; }}; export -f port; {}", if cmd.is_empty() { ":" } else { cmd })
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn platform_matrix() {
        assert!(MacPorts::validate_platform("macos").is_ok());
        assert!(MacPorts::validate_platform("linux").is_err());
        assert!(MacPorts::validate_platform("windows").is_err());
    }
    #[test]
    fn environment_is_child_local() {
        let before = std::env::var_os("PATH");
        let command = MacPorts::default().format_command("printf hello");
        if cfg!(target_os = "macos") {
            assert!(command.starts_with("export PATH=\"/opt/local/bin:/opt/local/sbin\":"));
        }
        assert_eq!(std::env::var_os("PATH"), before);
    }
    #[test]
    fn backend_selection_is_explicit_and_can_override_binary_location() {
        let native = MacPorts::default();
        let rust = MacPorts::new(MacPortsBackend::Rust);
        assert_eq!(
            native.executable(),
            std::path::Path::new("/opt/local/bin/port")
        );
        assert_eq!(
            rust.executable(),
            std::path::Path::new("/usr/local/bin/port")
        );
        assert_eq!(rust.backend(), MacPortsBackend::Rust);
        let custom = rust.with_executable("/tmp/custom prefix/port");
        if cfg!(target_os = "macos") {
            let command = custom.format_command("port version");
            assert!(command.contains("'/tmp/custom prefix/port'"));
        }
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn selected_backend_receives_literal_install_arguments_and_reports_failure() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let executable = dir.path().join("custom port");
        let args_file = dir.path().join("args");
        std::fs::write(
            &executable,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$@\" > {}\n",
                shell_quote(&args_file.to_string_lossy())
            ),
        )
        .unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        for backend in [MacPortsBackend::Native, MacPortsBackend::Rust] {
            let adapter = MacPorts::new(backend).with_executable(&executable);
            assert!(adapter.install(vec!["git", "curl"]).unwrap().success());
            assert_eq!(
                std::fs::read_to_string(&args_file).unwrap(),
                "-N\ninstall\ngit\ncurl\n"
            );
            let output = Command::new("bash")
                .arg("-c")
                .arg(adapter.format_command("port version"))
                .output()
                .unwrap();
            assert!(output.status.success());
            assert_eq!(std::fs::read_to_string(&args_file).unwrap(), "version\n");
        }
        std::fs::write(&executable, "#!/bin/sh\nexit 42\n").unwrap();
        assert!(MacPorts::new(MacPortsBackend::Rust)
            .with_executable(executable)
            .install(vec!["git"])
            .is_err());
    }
}
