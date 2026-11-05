//! Remember account identity for Studio, never credentials or session tokens.

use anyhow::{Context, Result};
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct AccountIdentity {
    pub account: String,
    pub did: String,
    pub handle: String,
    pub pds: String,
}

pub fn path() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("FLUENTCI_ACCOUNT_FILE") {
        return Ok(path.into());
    }
    Ok(dirs::home_dir()
        .context("Home directory is unavailable")?
        .join(".fluentci/account.json"))
}

pub fn read(path: &Path) -> Result<Option<AccountIdentity>> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(
            serde_json::from_slice(&bytes).context("Invalid remembered account file")?,
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn current() -> Result<Option<AccountIdentity>> {
    read(&path()?)
}

pub fn save(path: &Path, identity: &AccountIdentity) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    std::fs::create_dir_all(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut file, identity)?;
    file.write_all(b"\n")?;
    file.as_file().sync_all()?;
    file.persist(path)
        .context("Could not remember the current account")?;
    Ok(())
}
