//! Locate FluentCI configuration and monorepo roots without crossing repository boundaries.

use crate::config;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct Workspace {
    pub root: PathBuf,
    pub config: Option<PathBuf>,
}

impl Workspace {
    pub fn discover(start: &Path) -> Result<Self> {
        let start = start
            .canonicalize()
            .with_context(|| format!("Working directory {} does not exist", start.display()))?;
        anyhow::ensure!(
            start.is_dir(),
            "Working directory {} is not a directory",
            start.display()
        );
        let mut fallback = None;

        for directory in start.ancestors() {
            if let Some(config) = config::find(directory) {
                return Ok(Self {
                    root: directory.into(),
                    config: Some(config),
                });
            }
            if fallback.is_none() && (is_workspace(directory)? || has_legacy_pipeline(directory)) {
                fallback = Some(directory.to_path_buf());
            }
            if directory.join(".git").exists() {
                return Ok(Self {
                    root: fallback.unwrap_or_else(|| directory.into()),
                    config: None,
                });
            }
        }

        Ok(Self {
            root: fallback.unwrap_or(start),
            config: None,
        })
    }

    pub fn current() -> Result<Self> {
        Self::discover(&std::env::current_dir()?)
    }
}

fn has_legacy_pipeline(directory: &Path) -> bool {
    directory.join(".fluentci/workflows").is_dir()
        || [
            ".fluentci/mod.ts",
            ".fluentci/Cargo.toml",
            ".fluentci/plugin/Cargo.toml",
        ]
        .iter()
        .any(|file| directory.join(file).is_file())
}

fn is_workspace(directory: &Path) -> Result<bool> {
    if [
        "pnpm-workspace.yaml",
        "pnpm-workspace.yml",
        "lerna.json",
        "nx.json",
        "turbo.json",
        "go.work",
    ]
    .iter()
    .any(|file| directory.join(file).is_file())
    {
        return Ok(true);
    }
    let cargo = directory.join("Cargo.toml");
    if cargo.is_file() {
        let manifest: toml::Value = toml::from_str(&std::fs::read_to_string(&cargo)?)
            .with_context(|| format!("Reading workspace manifest {}", cargo.display()))?;
        if manifest.get("workspace").is_some() {
            return Ok(true);
        }
    }
    for filename in ["package.json", "deno.json"] {
        let path = directory.join(filename);
        if path.is_file() {
            let manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(&path)?)
                .with_context(|| format!("Reading workspace manifest {}", path.display()))?;
            if manifest.get("workspaces").is_some() || manifest.get("workspace").is_some() {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Return a relative path between two absolute, normalized paths.
pub fn relative_path(base: &Path, path: &Path) -> PathBuf {
    let base: Vec<_> = base.components().collect();
    let path: Vec<_> = path.components().collect();
    let common = base
        .iter()
        .zip(&path)
        .take_while(|(left, right)| left == right)
        .count();
    let mut relative = PathBuf::new();
    for _ in &base[common..] {
        relative.push("..");
    }
    for component in &path[common..] {
        relative.push(component.as_os_str());
    }
    relative
}
