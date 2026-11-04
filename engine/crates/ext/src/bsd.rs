//! Native BSD package managers. Provisioning and privilege elevation are explicit.
use crate::{exec_with_shell, homebrew::validate_packages, Extension};
use anyhow::{bail, Error};
use fluentci_types::Output;
use std::{
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BsdManager {
    FreeBsd,
    NetBsd,
    OpenBsd,
}
impl BsdManager {
    pub fn os(self) -> &'static str {
        match self {
            Self::FreeBsd => "freebsd",
            Self::NetBsd => "netbsd",
            Self::OpenBsd => "openbsd",
        }
    }
    pub fn executable(self) -> &'static str {
        match self {
            Self::FreeBsd => "/usr/local/sbin/pkg",
            Self::NetBsd => "/usr/pkg/bin/pkgin",
            Self::OpenBsd => "/usr/sbin/pkg_add",
        }
    }
    pub fn install_args(self) -> &'static [&'static str] {
        match self {
            Self::FreeBsd => &["install", "-y"],
            Self::NetBsd => &["-y", "install"],
            Self::OpenBsd => &["-I"],
        }
    }
    pub fn path_prefix(self) -> &'static str {
        match self {
            Self::FreeBsd | Self::OpenBsd => "/usr/local/bin:/usr/local/sbin",
            Self::NetBsd => "/usr/pkg/bin:/usr/pkg/sbin",
        }
    }
    pub fn validate_platform(self, os: &str) -> Result<(), Error> {
        if self.os() != os {
            bail!("{:?} requires {} (got {os})", self, self.os());
        }
        Ok(())
    }
}

pub struct BsdPackages {
    manager: BsdManager,
    executable: PathBuf,
}
impl BsdPackages {
    pub fn new(manager: BsdManager) -> Self {
        Self {
            manager,
            executable: manager.executable().into(),
        }
    }
    pub fn freebsd() -> Self {
        Self::new(BsdManager::FreeBsd)
    }
    pub fn netbsd() -> Self {
        Self::new(BsdManager::NetBsd)
    }
    pub fn openbsd() -> Self {
        Self::new(BsdManager::OpenBsd)
    }
    pub fn with_executable(mut self, path: impl Into<PathBuf>) -> Self {
        self.executable = path.into();
        self
    }
    pub fn executable(&self) -> &Path {
        &self.executable
    }
    pub fn install(&self, packages: Vec<&str>) -> Result<ExitStatus, Error> {
        validate_packages(&packages)?;
        self.setup()?;
        let status = self.install_command(&packages).status()?;
        if !status.success() {
            return Err(crate::worker::command_failure(
                &status,
                format!("{:?} package installation failed", self.manager),
            ));
        }
        Ok(status)
    }
    fn install_command(&self, packages: &[&str]) -> Command {
        let mut command = Command::new(&self.executable);
        command
            .args(self.manager.install_args())
            .args(packages)
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
        command
    }
}
impl Extension for BsdPackages {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Bsd {
            manager: self.manager.os().into(),
            executable: self.executable.clone(),
        })
    }

    fn setup(&self) -> Result<(), Error> {
        self.manager.validate_platform(std::env::consts::OS)?;
        if !self.executable.is_absolute() || !self.executable.is_file() {
            bail!(
                "Provision {:?} explicitly at {} before running this pipeline",
                self.manager,
                self.executable.display()
            );
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
        // BSD base systems provide sh, not necessarily bash.
        exec_with_shell(
            "/bin/sh",
            &self.format_command(cmd),
            tx,
            out,
            last_cmd,
            work_dir,
        )
    }
    fn format_command(&self, cmd: &str) -> String {
        if self
            .manager
            .validate_platform(std::env::consts::OS)
            .is_err()
        {
            return "echo 'Unsupported BSD package-manager platform' >&2; exit 1".into();
        }
        format!(
            "export PATH=\"{}:$PATH\"; {}",
            self.manager.path_prefix(),
            if cmd.is_empty() { ":" } else { cmd }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn platform_matrix_and_install_arguments() {
        for manager in [BsdManager::FreeBsd, BsdManager::NetBsd, BsdManager::OpenBsd] {
            for os in ["freebsd", "netbsd", "openbsd", "linux", "macos"] {
                assert_eq!(manager.validate_platform(os).is_ok(), manager.os() == os);
            }
            let adapter = BsdPackages::new(manager);
            let command = adapter.install_command(&["git", "curl"]);
            let args: Vec<_> = command.get_args().map(|a| a.to_str().unwrap()).collect();
            let mut expected = manager.install_args().to_vec();
            expected.extend(["git", "curl"]);
            assert_eq!(args, expected);
            assert_eq!(command.get_program(), manager.executable());
        }
    }
    #[test]
    fn custom_install_command_preserves_package_arguments() {
        let adapter = BsdPackages::netbsd().with_executable("/custom prefix/pkgin");
        let command = adapter.install_command(&["python312-3.12.9"]);
        assert_eq!(command.get_program(), "/custom prefix/pkgin");
        assert_eq!(command.get_args().last().unwrap(), "python312-3.12.9");
    }
}
