use std::{fs::File, io::Read, process::ExitStatus, sync::mpsc::Sender};

use crate::Extension;
use anyhow::{Error, Ok};
use fluentci_types::Output;

#[derive(Default)]
pub struct Md5 {}

impl Extension for Md5 {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Md5)
    }

    fn exec(
        &mut self,
        file_path: &str,
        tx: Sender<String>,
        _out: Output,
        _last_cmd: bool,
        _work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        let mut file = File::open(file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        tx.send(format!("{:x}", md5::compute(&buffer)))?;

        Ok(ExitStatus::default())
    }

    fn setup(&self) -> Result<(), Error> {
        Ok(())
    }
}
