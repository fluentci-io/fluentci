use std::{fs::File, io::Read, process::ExitStatus, sync::mpsc::Sender};

use crate::Extension;
use anyhow::Error;
use fluentci_types::Output;
use sha2::Digest;

#[derive(Default)]
pub struct Sha256 {}

impl Extension for Sha256 {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Sha256)
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
        let mut hasher = sha2::Sha256::new();
        hasher.update(&buffer);
        tx.send(format!("{:x}", hasher.finalize()))?;
        Ok(ExitStatus::default())
    }

    fn setup(&self) -> Result<(), Error> {
        Ok(())
    }
}
