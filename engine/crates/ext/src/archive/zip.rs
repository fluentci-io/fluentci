use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;
use std::{env, path::Path, process::ExitStatus, sync::mpsc::Sender};

#[derive(Default)]
pub struct Zip {}

impl Extension for Zip {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Zip)
    }

    fn exec(
        &mut self,
        path: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        _work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;

        let output_file = match path.split('/').next_back() {
            Some(file) => format!("{}.zip", file),
            None => format!("{}.zip", path),
        };

        let output_file = env::var("FLUENTCI_ZIP_OUTPUT_FILE").unwrap_or(output_file.to_string());
        let parent_dir = Path::new(path).parent().unwrap();
        let work_dir = parent_dir.to_str().unwrap();
        let path = Path::new(path).file_name().unwrap().to_str().unwrap();

        let cmd = format!("zip -r {} {}", output_file, path);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Pkgx::default().install(vec!["zip"])?;
        Ok(())
    }
}
