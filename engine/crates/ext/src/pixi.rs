use std::{
    env,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

use crate::{exec, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct Pixi {}

impl Extension for Pixi {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Pixi)
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

        let mut child = Command::new("bash")
            .arg("-c")
            .arg("pixi install")
            .current_dir(work_dir)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;
        child.wait()?;

        let cmd = format!("eval \"$(pixi shell-hook)\" ; {}", cmd);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        let path = format!(
            "{}:{}",
            env::var("PATH")?,
            format!("{}/.pixi/bin", env::var("HOME")?)
        );
        env::set_var("PATH", &path);
        crate::bootstrap::install("pixi", "https://pixi.sh/install.sh", "/bin/bash", &[], &[])?;
        Ok(())
    }

    fn format_command(&self, cmd: &str) -> String {
        format!("pixi install ; eval \"$(pixi shell-hook)\" ; {}", cmd)
    }
}
