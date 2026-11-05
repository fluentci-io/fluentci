use crate::{exec, pkgx::Pkgx, Extension};
use anyhow::Error;
use fluentci_types::Output;
use std::{path::Path, process::ExitStatus, sync::mpsc::Sender};

#[derive(Default)]
pub struct Git {}

impl Git {
    pub fn validate_url(&self, url: &str) -> Result<(), Error> {
        if url.is_empty() {
            return Err(Error::msg("URL is empty"));
        }
        if !regex::Regex::new(
            r"^(?:https:\/\/([^\/]+)\/([^\/]+)\/([^\/]+)|git@([^:]+):([^\/]+)\/([^\/]+))$",
        )
        .unwrap()
        .is_match(url)
        {
            return Err(Error::msg("Invalid URL"));
        }
        Ok(())
    }
}

impl Extension for Git {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Git)
    }

    fn exec(
        &mut self,
        url: &str,
        tx: Sender<String>,
        out: Output,
        last_cmd: bool,
        work_dir: &str,
    ) -> Result<ExitStatus, Error> {
        self.setup()?;

        if self.validate_url(url).is_err() {
            return Err(Error::msg("Invalid URL"));
        }

        let repo = url.split('/').next_back().unwrap().replace(".git", "");
        let git_dir = format!("{}/{}/.git", work_dir, repo);
        if Path::new(&git_dir).exists() {
            let cmd = format!("git pull {}", url);
            let work_dir = format!("{}/{}", work_dir, repo);
            return exec(&cmd, tx, out, last_cmd, &work_dir);
        }

        let cmd = format!("git clone {}", url);
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        Pkgx::default().install(vec!["git"])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_url() {
        let git = Git::default();
        assert!(git.validate_url("https://github.com/tsirysndr/me").is_ok());
        assert!(git.validate_url("git@github.com:tsirysndr/me").is_ok());
        assert!(git.validate_url("github.com:tsirysndr/me").is_err());
    }
}
