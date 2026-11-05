use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;
use std::{env, path::Path, process::ExitStatus, sync::mpsc::Sender};

#[derive(Default)]
pub struct TarCzvf {}

impl Extension for TarCzvf {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::TarCzvf)
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
            Some(file) => format!("{}.tar.gz", file),
            None => format!("{}.tar.gz", path),
        };

        let output_file =
            env::var("FLUENTCI_TAR_CZVF_OUTPUT_FILE").unwrap_or(output_file.to_string());

        let parent_dir = Path::new(path).parent().unwrap();
        let work_dir = parent_dir.to_str().unwrap();
        let path = Path::new(path).file_name().unwrap().to_str().unwrap();

        let cmd = format!("tar czvf {} {}", output_file, path);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Pkgx::default().install(vec!["tar"])?;
        Ok(())
    }
}
