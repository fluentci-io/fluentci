use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;
use std::{env, process::ExitStatus, sync::mpsc::Sender};

#[derive(Default)]
pub struct Proto {}

impl Extension for Proto {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Proto)
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
        let pkgx = Pkgx::default();
        pkgx.setup()?;

        let proto_home = format!("{}/.proto", env::var("HOME")?);
        env::set_var("PROTO_HOME", &proto_home);

        let path = format!("{proto_home}/shims:{proto_home}/bin:{}", env::var("PATH")?);

        env::set_var("PATH", &path);

        pkgx.install(vec!["unzip", "zip", "git", "xz"])?;

        crate::bootstrap::install(
            "proto",
            "https://moonrepo.dev/install/proto.sh",
            "/bin/bash",
            &["--yes"],
            &[],
        )?;
        Ok(())
    }
}
