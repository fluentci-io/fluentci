//! Check SDK toolchains without executing partially available builds.

use crate::config::{ModuleRuntime, Sdk};
use anyhow::{Context, Result};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

pub fn require_sdk(sdk: Sdk, directory: &Path, pending_dependencies: bool) -> Result<()> {
    require_sdk_runtime(sdk, directory, pending_dependencies, ModuleRuntime::Extism)
}

pub fn require_sdk_runtime(
    sdk: Sdk,
    directory: &Path,
    pending_dependencies: bool,
    runtime: ModuleRuntime,
) -> Result<()> {
    let required: &[&str] = match (sdk, runtime) {
        (Sdk::Rust, _) => &["cargo", "rustc", "rustup"],
        (Sdk::Elixir, _) => &["elixir", "mix", "cargo", "rustc", "rustup"],
        (Sdk::Purescript, ModuleRuntime::Component) => &["node", "npm", "purs", "spago"],
        (Sdk::Clojurescript, ModuleRuntime::Component) => &["node", "npm", "java", "clojure"],
        (Sdk::Gleam, ModuleRuntime::Component) => &["node", "npm", "gleam"],
        (Sdk::Typescript, ModuleRuntime::Component) => &["node", "npm"],
        (Sdk::Rescript, ModuleRuntime::Component) => &["node", "npm", "rescript"],
        (Sdk::Python, ModuleRuntime::Component) => &["uv"],
        (Sdk::Purescript, ModuleRuntime::Extism) => &["node", "npm", "purs", "spago", "extism-js"],
        (Sdk::Clojurescript, ModuleRuntime::Extism) => &[
            "node",
            "npm",
            "java",
            "clojure",
            "extism-js",
            "wasm-merge",
            "wasm-opt",
        ],
        (Sdk::Gleam, ModuleRuntime::Extism) => &["node", "npm", "gleam", "extism-js"],
        (Sdk::Typescript, ModuleRuntime::Extism) => &["node", "npm", "extism-js"],
        (Sdk::Python, ModuleRuntime::Extism) => &["uv", "extism-py", "wasm-merge", "wasm-opt"],
        (Sdk::Rescript, ModuleRuntime::Extism) => &["node", "npm", "rescript", "extism-js"],
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
