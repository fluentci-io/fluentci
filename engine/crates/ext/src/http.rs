use std::{process::ExitStatus, sync::mpsc::Sender};

use crate::{bootstrap, exec, Extension};
use anyhow::Error;
use fluentci_types::Output;

#[derive(Default)]
pub struct Http {}

impl Http {
    pub fn validate_url(&self, url: &str) -> Result<(), Error> {
        if url.is_empty() {
            return Err(Error::msg("URL is empty"));
        }
        if !regex::Regex::new(r"^(http|https)://[^ ]+$")
            .unwrap()
            .is_match(url)
        {
            return Err(Error::msg("Invalid URL"));
        }
        Ok(())
    }
}

impl Extension for Http {
    fn worker_spec(&self) -> Result<crate::worker::Provider, Error> {
        Ok(crate::worker::Provider::Http)
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

        let filename = sha256::digest(url).to_string();

        let cmd = format!(
            "{} --fail --silent --show-error --location --url {} --output {}",
            bootstrap::native_curl(),
            bootstrap::quote(url),
            filename
        );
        exec(&cmd, tx, out, last_cmd, work_dir)
    }

    fn setup(&self) -> Result<(), Error> {
        if !std::path::Path::new(bootstrap::native_curl()).is_file() {
            return Err(Error::msg(
                "OS-provided curl is missing; install the operating system's curl package",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_url() {
        let http = Http::default();
        assert!(http.validate_url("https://example.com").is_ok());
        assert!(http.validate_url("http://example.com").is_ok());
        assert!(http.validate_url("http://example.com/").is_ok());
        assert!(http.validate_url("http://example.com/path").is_ok());
        assert!(http.validate_url("http://example.com/path?query").is_ok());
        assert!(http
            .validate_url("http://example.com/path?query#fragment")
            .is_ok());
        assert!(http
            .validate_url("example.com/path?query#fragment")
            .is_err());
        assert!(http.validate_url("ftp://example.com").is_err());
    }
}
