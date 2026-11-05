use std::{
    env,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

use crate::{exec, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct Hermit {}

impl Hermit {
    pub fn install(&self, pkgs: Vec<&str>) -> Result<ExitStatus, Error> {
        self.setup()?;

        Command::new("bash")
            .arg("-c")
            .arg("[ -f ./bin/activate-hermit ] || hermit init")
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?
            .wait()?;

        let mut child = Command::new("bash")
            .arg("-c")
            .arg(format!(
                ". ./bin/activate-hermit && hermit install {}",
                pkgs.join(" ")
            ))
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;
        child.wait().map_err(Error::from)
    }
}

impl Extension for Hermit {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Hermit)
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

        Command::new("bash")
            .arg("-c")
            .arg("[ -f ./bin/activate-hermit ] || hermit init")
            .current_dir(work_dir)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?
            .wait()?;

        let cmd = format!(". ./bin/activate-hermit && {}", cmd);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        let path = format!(
            "{}:{}",
            env::var("PATH")?,
            format!("{}/bin", env::var("HOME")?)
        );
        env::set_var("PATH", &path);

        let status = Command::new("sh")
            .arg("-c")
            .arg("type hermit > /dev/null")
            .spawn()?
            .wait()?;

        if status.success() {
            return Ok(());
        }

        crate::bootstrap::install(
            "hermit",
            "https://github.com/cashapp/hermit/releases/download/stable/install.sh",
            "/bin/bash",
            &[],
            &[],
        )?;
        Ok(())
    }
}
