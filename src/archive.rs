//! Reproducible source bundles and path-checked extraction.

use anyhow::{Context, Result};
use std::{io::Cursor, path::Path};
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

pub fn bundle(root: &Path) -> Result<Vec<u8>> {
    let mut paths = Vec::new();
    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .require_git(false)
        .add_custom_ignore_filename(".fluentciignore")
        .filter_entry(|e| {
            !matches!(
                e.file_name().to_str(),
                Some(".git" | "target" | "node_modules")
            )
        })
        .build();
    for entry in walker {
        let entry = entry?;
        if entry.file_type().is_some_and(|t| t.is_file()) {
            paths.push(entry.into_path());
        }
    }
    paths.sort();
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for path in paths {
        let name = path
            .strip_prefix(root)?
            .to_string_lossy()
            .replace('\\', "/");
        zip.start_file(
            name,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )?;
        let mut file = std::fs::File::open(path)?;
        std::io::copy(&mut file, &mut zip)?;
    }
    Ok(zip.finish()?.into_inner())
}

pub fn extract(bytes: &[u8], destination: &Path) -> Result<()> {
    let mut zip = ZipArchive::new(Cursor::new(bytes))?;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index)?;
        let path = destination.join(entry.enclosed_name().context("Unsafe archive path")?);
        if entry.is_dir() {
            std::fs::create_dir_all(&path)?;
        } else {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut file = std::fs::File::create(path)?;
            std::io::copy(&mut entry, &mut file)?;
        }
    }
    Ok(())
}
