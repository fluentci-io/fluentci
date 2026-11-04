use std::{env, fs, process::ExitStatus, sync::mpsc::Sender};

use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct TarXzvf {}

impl Extension for TarXzvf {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::TarXzvf)
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
            env::var("FLUENTCI_TAR_XZVF_OUTPUT_DIRECTORY").unwrap_or(".".to_string());

        fs::create_dir_all(&output_directory)?;

        let cmd = format!("tar xzvf {} -C {}", path, output_directory);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Pkgx::default().install(vec!["tar"])?;
        Ok(())
    }
}
