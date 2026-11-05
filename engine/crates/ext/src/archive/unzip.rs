use std::{env, process::ExitStatus, sync::mpsc::Sender};

use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct Unzip {}

impl Extension for Unzip {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Unzip)
    }

    fn exec(
        &mut self,
        path: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;

        let output_directory =
            env::var("FLUENTCI_UNZIP_OUTPUT_DIRECTORY").unwrap_or(".".to_string());

        let cmd = format!("unzip -o {} -d {}", path, output_directory);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Pkgx::default().install(vec!["unzip"])?;
        Ok(())
    }
}
