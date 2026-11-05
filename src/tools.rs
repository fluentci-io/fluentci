//! Check SDK toolchains without executing partially available builds.

use crate::config::Sdk;
use anyhow::{Context, Result};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

pub fn require_sdk(sdk: Sdk, directory: &Path, pending_dependencies: bool) -> Result<()> {
    let required: &[&str] = match sdk {
        Sdk::Rust => &["cargo", "rustc", "rustup"],
        Sdk::Purescript => &["node", "npm", "purs", "spago", "extism-js"],
        Sdk::Clojurescript => &[
            "node",
            "npm",
            "java",
            "clojure",
            "extism-js",
            "wasm-merge",
            "wasm-opt",
        ],
        Sdk::Elixir => &["elixir", "mix", "cargo", "rustc", "rustup"],
        Sdk::Gleam => &["node", "npm", "gleam", "extism-js"],
        Sdk::Typescript => &["node", "npm", "extism-js"],
        Sdk::Python => &["uv", "extism-py", "wasm-merge", "wasm-opt"],
        Sdk::Rescript => &["node", "npm", "rescript", "extism-js"],
    };
    let missing: Vec<_> = required
        .iter()
        .copied()
        .filter(|program| {
            let local = match sdk {
                Sdk::Python if *program != "uv" => Some(".venv/bin"),
                Sdk::Purescript
                | Sdk::Clojurescript
                | Sdk::Gleam
                | Sdk::Typescript
                | Sdk::Rescript
                    if !matches!(*program, "node" | "npm") =>
                {
                    Some("node_modules/.bin")
                }
                _ => None,
            };
            find(program, directory, local).is_none()
                && !(pending_dependencies && dependency_will_install(program, directory))
        })
        .collect();
    anyhow::ensure!(
        missing.is_empty(),
        "Missing required tools for {} SDK in {}: {}. Install these tools and retry",
        sdk.name(),
        directory.display(),
        missing.join(", ")
    );
    Ok(())
}

pub fn require_build_command(program: &str, directory: &Path) -> Result<PathBuf> {
    find(program, directory, Some("node_modules/.bin"))
        .or_else(|| find(program, directory, Some(".venv/bin")))
        .with_context(|| {
            format!(
                "Missing required build tool {program:?} for module in {}. Install it or update the module's build command",
                directory.display()
            )
        })
}

fn dependency_will_install(program: &str, directory: &Path) -> bool {
    if directory.join("node_modules").is_dir() {
        return false;
    }
    let package = match program {
        "purs" => "purescript",
        "spago" => "spago",
        "rescript" => "rescript",
        _ => return false,
    };
    let Some(manifest) = std::fs::read(directory.join("package.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
    else {
        return false;
    };
    ["dependencies", "devDependencies"]
        .iter()
        .any(|field| manifest[field].get(package).is_some())
}

fn find(program: &str, directory: &Path, local: Option<&str>) -> Option<PathBuf> {
    let program_path = Path::new(program);
    if program_path.is_absolute() || program_path.components().count() > 1 {
        let path = directory.join(program_path);
        return executable(&path).then_some(path);
    }
    let mut search = Vec::new();
    if let Some(local) = local {
        search.push(directory.join(local));
    }
    let path = std::env::var_os("PATH").unwrap_or_default();
    search.extend(std::env::split_paths(&path).map(|path| directory.join(path)));
    search
        .into_iter()
        .map(|path| path.join(program))
        .find(|path| executable(path))
}

fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
