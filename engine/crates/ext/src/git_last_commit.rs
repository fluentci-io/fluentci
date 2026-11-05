use std::{process::ExitStatus, sync::mpsc::Sender};

use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct GitLastCommit {}

impl Extension for GitLastCommit {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::GitLastCommit)
    }

    fn exec(
        &mut self,
        branch: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;

        let cmd = format!("git log -1 --pretty=format:%H {}", branch);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Pkgx::default().install(vec!["git"])?;
        Ok(())
    }
}
