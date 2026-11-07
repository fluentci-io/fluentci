//! Shared SDK-neutral metadata contract, artifact annotation, and registry metadata.

use crate::registry;
use anyhow::{Context, Result};
pub use fluentci_engine::cmd::metadata::*;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

pub async fn resolve(root: &Path, reference: &str, frozen: bool) -> Result<registry::Resolved> {
    let mut package = crate::lockfile::resolve(root, reference, frozen).await?;
    // Existing lockfiles pin artifacts but do not store source function metadata.
    // Look up that exact publisher/version, never re-resolve a moving "latest".
    if package.metadata.url.is_some()
        && package
            .metadata
            .functions
            .as_ref()
            .is_none_or(Vec::is_empty)
    {
        let author = package
            .metadata
            .author
            .as_deref()
            .context("Missing module author")?;
        let name = package
            .metadata
            .name
            .as_deref()
            .context("Missing module name")?;
        let pinned = format!("@{author}/{name}@{}", package.version);
        if let Ok(Ok(published)) =
            tokio::time::timeout(Duration::from_secs(5), registry::resolve(&pinned)).await
        {
            apply_published_metadata(&mut package, published)?;
        }
        // Offline help can still inspect cached Wasm exports and embedded metadata.
    }
    Ok(package)
}

pub(crate) fn apply_published_metadata(
    locked: &mut registry::Resolved,
    published: registry::Resolved,
) -> Result<()> {
    anyhow::ensure!(
        locked.version == published.version
            && locked.metadata.author == published.metadata.author
            && locked.metadata.name == published.metadata.name
            && locked.metadata.sha256.is_some()
            && locked.metadata.sha256 == published.metadata.sha256,
        "Published help metadata does not match the locked module's identity and checksum"
    );
    locked.metadata.functions = published.metadata.functions;
    locked.metadata.description = published.metadata.description;
    Ok(())
}

pub async fn annotated_artifact(artifact: &Path, declared: Vec<Function>) -> Result<PathBuf> {
    if declared.is_empty() {
        return Ok(artifact.to_path_buf());
    }
    let bytes = tokio::fs::read(artifact).await?;
    let annotated = embed(&bytes, declared)?;
    let directory = dirs::cache_dir()
        .context("Cache directory unavailable")?
        .join("fluentci/annotated");
    tokio::fs::create_dir_all(&directory).await?;
    let path = directory.join(format!("{}.wasm", sha256::digest(annotated.as_slice())));
    let mut file = tempfile::NamedTempFile::new_in(&directory)?;
    std::io::Write::write_all(&mut file, &annotated)?;
    file.persist(&path)?;
    Ok(path)
}

pub async fn prepare_package(package: &registry::Resolved) -> Result<PathBuf> {
    let artifact = registry::wasm_artifact(package).await?;
    annotated_artifact(
        &artifact,
        package.metadata.functions.clone().unwrap_or_default(),
    )
    .await
}
