use crate::{exec, Extension};
use anyhow::Error;
use fluentci_types::Output;
use std::{
    env,
    process::{Command, ExitStatus, Stdio},
    sync::mpsc::Sender,
};

#[derive(Default)]
pub struct Mise {}

impl Mise {
    pub fn trust(&self) -> Result<ExitStatus, Error> {
        self.setup()?;

        let mut child = Command::new("bash")
            .arg("-c")
            .arg("mise trust")
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;
        child.wait().map_err(Error::from)
    }
}

impl Extension for Mise {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Mise)
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
            .arg("mise install")
            .current_dir(work_dir)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()?;
        child.wait()?;

        let cmd = format!(
            "eval \"$(~/.local/bin/mise activate bash)\" && mise x -- {}",
            cmd
        );
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        let path = format!("{}:{}/.local/bin", env::var("PATH")?, env::var("HOME")?);
        env::set_var("PATH", &path);
        crate::bootstrap::install("mise", "https://mise.run", "/bin/sh", &[], &[])?;
        Ok(())
    }

    fn format_command(&self, cmd: &str) -> String {
        format!(
            "mise install ; eval \"$(~/.local/bin/mise activate bash)\" && mise x -- {}",
            cmd
        )
    }
}
