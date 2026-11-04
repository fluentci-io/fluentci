//! Homebrew environment adapter. Setup validates an existing installation;
//! installing Homebrew itself is an explicit host provisioning operation.
use crate::{exec, Extension};
use anyhow::{bail, Error};
use fluentci_types::Output;
use std::{
    path::PathBuf,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

#[derive(Default)]
pub struct Homebrew;

impl Homebrew {
    pub fn prefix_for(os: &str, arch: &str) -> Result<&'static str, Error> {
        match (os, arch) {
            ("macos", "aarch64") => Ok("/opt/homebrew"),
            ("linux", "x86_64") => Ok("/home/linuxbrew/.linuxbrew"),
            _ => bail!("Homebrew supports macOS ARM64 and Linux x86_64 only (got {os}/{arch})"),
        }
    }

    pub fn executable(&self) -> Result<PathBuf, Error> {
        Ok(PathBuf::from(Self::prefix_for(
            std::env::consts::OS,
            std::env::consts::ARCH,
        )?)
        .join("bin/brew"))
    }

    /// Explicit package installation. No shell interpolation or automatic sudo.
    pub fn install(&self, packages: Vec<&str>) -> Result<ExitStatus, Error> {
        validate_packages(&packages)?;
        self.setup()?;
        let status = Command::new(self.executable()?)
            .arg("install")
            .arg("--")
            .args(packages)
            .env("NONINTERACTIVE", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status()?;
        if !status.success() {
            return Err(crate::worker::command_failure(
                &status,
                "brew install failed",
            ));
        }
        Ok(status)
    }
}

pub(crate) fn validate_packages(packages: &[&str]) -> Result<(), Error> {
    if packages.is_empty() {
        bail!("at least one package is required");
    }
    for package in packages {
        if !package.starts_with(|c: char| c.is_ascii_alphanumeric())
            || !package
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "@/._+-".contains(c))
        {
            bail!("invalid package name: {package}");
        }
    }
    Ok(())
}

impl Extension for Homebrew {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Homebrew)
    }

    fn setup(&self) -> Result<(), Error> {
        let executable = self.executable()?;
        if !executable.is_file() {
            bail!("Homebrew is not installed at {}. Provision it explicitly: https://docs.brew.sh/Installation", executable.display());
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
        // The guard runs here too because services call format_command directly.
        match self.executable() {
            Ok(brew) => format!("__fluentci_brew_env=\"$( '{}' shellenv bash )\" && eval \"$__fluentci_brew_env\" && {{\n{}\n}}", brew.display(), if cmd.is_empty() { ":" } else { cmd }),
            Err(_) => "echo 'Unsupported Homebrew platform' >&2; exit 1".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn platform_matrix() {
        assert_eq!(
            Homebrew::prefix_for("macos", "aarch64").unwrap(),
            "/opt/homebrew"
        );
        assert_eq!(
            Homebrew::prefix_for("linux", "x86_64").unwrap(),
            "/home/linuxbrew/.linuxbrew"
        );
        for (os, arch) in [
            ("macos", "x86_64"),
            ("linux", "aarch64"),
            ("windows", "x86_64"),
        ] {
            assert!(Homebrew::prefix_for(os, arch).is_err());
        }
    }
    #[test]
    fn rejects_empty_options_and_shell_fragments() {
        assert!(validate_packages(&["git", "node@22", "owner/tap/formula"]).is_ok());
        for names in [
            vec![],
            vec!["--force"],
            vec!["git; touch /tmp/no"],
            vec!["$(echo bad)"],
        ] {
            assert!(validate_packages(&names).is_err());
        }
    }
    #[test]
    fn formatting_does_not_mutate_environment() {
        let before = std::env::var_os("PATH");
        let command = Homebrew.format_command("printf hello");
        if Homebrew::prefix_for(std::env::consts::OS, std::env::consts::ARCH).is_ok() {
            assert!(command.contains("shellenv bash"));
            assert!(command.contains("printf hello"));
        }
        assert_eq!(std::env::var_os("PATH"), before);
    }
}
