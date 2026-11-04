use std::{
    env::consts::OS,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

use crate::{exec, nix::Nix, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct Devenv {}

impl Extension for Devenv {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Devenv)
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

        if cmd.is_empty() {
            return Ok(ExitStatus::default());
        }

        Pkgx::default().install(vec!["direnv"])?;

        Command::new("bash")
            .arg("-c")
            .arg("[ -f devenv.nix ] || devenv init")
            .current_dir(work_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?
            .wait()?;

        let cmd = format!("devenv shell {}", cmd);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Nix::default().setup()?;

        let mut child = Command::new("sh")
            .arg("-c")
            .arg("type devenv > /dev/null")
            .spawn()?;
        let status = child.wait()?;

        if status.success() {
            return Ok(());
        }

        let sudo = Command::new("sh")
            .arg("-c")
            .arg("type sudo > /dev/null")
            .spawn()?
            .wait()?;

        let sudo = if sudo.success() { "sudo" } else { "" };

        Command::new("sh")
            .arg("-c")
            .arg(&format!(
                "echo \"trusted-users = root $USER\" | {} tee -a /etc/nix/nix.conf",
                sudo
            ))
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?
            .wait()?;

        let sudo = if OS == "macos" { "sudo" } else { "" };

        Command::new("sh")
            .arg("-c")
            .arg(&format!(
                "{} nix profile install --accept-flake-config github:cachix/cachix",
                sudo,
            ))
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?
            .wait()?;

        Command::new("sh")
            .arg("-c")
            .arg("cachix use devenv")
            .spawn()?
            .wait()?;

        Command::new("sh")
            .arg("-c")
            .arg(&format!("{} nix profile install --accept-flake-config tarball+https://install.devenv.sh/latest", sudo))
            .stdin(Stdio::inherit())
            .spawn()?
            .wait()?;

        Ok(())
    }

    fn format_command(&self, cmd: &str) -> String {
        format!("[ -f devenv.nix ] || devenv init ; devenv shell {}", cmd)
    }
}
