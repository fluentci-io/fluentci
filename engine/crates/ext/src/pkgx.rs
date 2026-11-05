use crate::{exec, Extension};
use anyhow::Error;
use fluentci_types::Output;
use std::{
    env,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

#[derive(Default)]
pub struct Pkgx {}

impl Pkgx {
    pub fn install(&self, pkgs: Vec<&str>) -> Result<ExitStatus, Error> {
        self.setup()?;

        let mut child = Command::new("sh")
            .arg("-c")
            .arg(format!("pkgm install {}", pkgs.join(" ")))
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;
        child.wait().map_err(Error::from)
    }
}

impl Extension for Pkgx {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Pkgx)
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

        exec(cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        let path = format!("{}:{}/.local/bin", env::var("PATH")?, env::var("HOME")?);
        env::set_var("PATH", &path);
        crate::bootstrap::install("pkgx", "https://pkgx.sh", "/bin/sh", &[], &[])?;
        Ok(())
    }

    // TODO remove this
    fn format_command(&self, cmd: &str) -> String {
        cmd.to_string()
    }
}
