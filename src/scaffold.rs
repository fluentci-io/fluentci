//! Embed SDK starter projects independently of the developer's checkout.

use crate::config::{ModuleRuntime, Sdk};
use anyhow::{Context, Result};
use rust_embed::RustEmbed;
use std::path::Path;
use tokio::io::AsyncWriteExt;

#[derive(RustEmbed)]
#[folder = "templates/sdk/"]
#[exclude = "**/node_modules/**"]
#[exclude = "**/__pycache__/**"]
#[exclude = "**/_build/**"]
#[exclude = "**/target/**"]
struct Templates;

#[derive(RustEmbed)]
#[folder = "templates/inspection/"]
#[exclude = "**/node_modules/**"]
#[exclude = "**/target/**"]
#[exclude = "**/__pycache__/**"]
struct Inspection;

#[derive(RustEmbed)]
#[folder = "engine/crates/components/wit/"]
struct ComponentWit;

#[derive(RustEmbed)]
#[folder = "templates/components/"]
#[exclude = "**/node_modules/**"]
#[exclude = "**/target/**"]
#[exclude = "**/__pycache__/**"]
struct ComponentTemplates;

pub async fn write(directory: &Path, name: &str, sdk: Sdk) -> Result<()> {
    write_with_runtime(directory, name, sdk, ModuleRuntime::default()).await
}

pub async fn write_with_runtime(
    directory: &Path,
    name: &str,
    sdk: Sdk,
    runtime: ModuleRuntime,
) -> Result<()> {
    for path in Inspection::iter() {
        let asset = Inspection::get(&path).context("Missing SDK inspection tool")?;
        let destination = directory.join(".sdk/inspection").join(path.as_ref());
        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .await?;
        file.write_all(&asset.data).await?;
    }
    if runtime == ModuleRuntime::Component && sdk == Sdk::Rust {
        for path in ComponentWit::iter() {
            let asset = ComponentWit::get(&path).context("Missing component host WIT")?;
            let destination = directory.join(".sdk/wit").join(path.as_ref());
            create_file(&destination, std::str::from_utf8(&asset.data)?).await?;
        }
        create_file(&directory.join("Cargo.toml"), &format!(
            "[package]\nname = {}\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[package.metadata.fluentci]\nruntime = \"component\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n\n[dependencies]\nwit-bindgen = \"=0.57.1\"\nfluentci-pdk = {{ path = \".sdk/inspection/component-rust\" }}\n\n[build-dependencies]\nfluentci-inspection = {{ path = \".sdk/inspection/rust\" }}\n\n[workspace]\nexclude = [\".sdk/inspection/rust\", \".sdk/inspection/component-rust\", \".sdk/inspection/component-types\", \".sdk/inspection/component-primitives\"]\n",toml::Value::String(name.into())
        )).await?;
        create_file(&directory.join("build.rs"), "fn main() {\n    fluentci_inspection::generate_component(std::path::Path::new(&std::env::var(\"CARGO_MANIFEST_DIR\").unwrap()), std::path::Path::new(&std::env::var(\"OUT_DIR\").unwrap()), include_str!(\".sdk/wit/runtime.wit\")).expect(\"Generating component WIT and bindings\");\n}\n").await?;
        create_file(
            &directory.join("src/lib.rs"),
            "mod jobs;\n\ninclude!(concat!(env!(\"OUT_DIR\"), \"/component.rs\"));\n",
        )
        .await?;
        create_file(&directory.join("src/jobs.rs"), "/// Greeting arguments.\npub struct HelloArgs {\n    /// Name to greet.\n    pub name: String,\n}\n\n/// Greet someone from a native Wasm component.\npub fn hello(args: HelloArgs) -> String {\n    format!(\"Hello, {}!\", args.name)\n}\n").await?;
        create_file(&directory.join(".gitignore"), "/target/\n").await?;
    } else if sdk == Sdk::Rust {
        let manifest = format!(
            "[package]\nname = {}\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n\n[dependencies]\nextism-pdk = \"=1.4.1\"\nserde = {{ version = \"1\", features = [\"derive\"] }}\n\n[build-dependencies]\nfluentci-inspection = {{ path = \".sdk/inspection/rust\" }}\n\n[workspace]\nexclude = [\".sdk/inspection/rust\"]\n",
            toml::Value::String(name.into())
        );
        create_file(&directory.join("Cargo.toml"), &manifest).await?;
        create_file(&directory.join("src/lib.rs"), "use extism_pdk::*;\n\ninclude!(concat!(env!(\"OUT_DIR\"), \"/fluentci_metadata.rs\"));\n\n#[plugin_fn]\npub fn hello() -> FnResult<String> {\n    Ok(\"Hello from FluentCI\".into())\n}\n").await?;
        create_file(&directory.join(".gitignore"), "/target/\n").await?;
        create_file(
            &directory.join("build.rs"),
            "fn main() {\n    fluentci_inspection::generate(std::path::Path::new(&std::env::var(\"CARGO_MANIFEST_DIR\").unwrap()), std::path::Path::new(&std::env::var(\"OUT_DIR\").unwrap())).expect(\"Inspecting module signatures\");\n}\n",
        )
        .await?;
    } else {
        let prefix = format!("{}/", sdk.name());
        for path in Templates::iter().filter(|path| path.starts_with(&prefix)) {
            let relative = path
                .strip_prefix(&prefix)
                .context("Invalid SDK template path")?;
            if runtime == ModuleRuntime::Component
                && matches!(relative, "package-lock.json" | "imports.d.ts")
            {
                continue;
            }
            let asset = if runtime == ModuleRuntime::Component {
                ComponentTemplates::get(&path).or_else(|| Templates::get(&path))
            } else {
                Templates::get(&path)
            }
            .context("Missing embedded SDK template")?;
            let path = directory.join(relative);
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            let mut file = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .await?;
            if matches!(
                relative,
                "package.json" | "package-lock.json" | "rescript.json"
            ) {
                let mut package: serde_json::Value = serde_json::from_slice(&asset.data)?;
                package["name"] = serde_json::json!(format!("fluentci-{name}"));
                if relative == "package-lock.json" {
                    package["packages"][""]["name"] = package["name"].clone();
                }
                file.write_all(serde_json::to_string_pretty(&package)?.as_bytes())
                    .await?;
            } else {
                file.write_all(&asset.data).await?;
            }
        }
    }
    if runtime == ModuleRuntime::Component && sdk != Sdk::Rust {
        let prefix = format!("{}/", sdk.name());
        for path in ComponentTemplates::iter().filter(|path| path.starts_with(&prefix)) {
            if Templates::get(&path).is_some() {
                continue;
            }
            let relative = path
                .strip_prefix(&prefix)
                .context("Invalid component template path")?;
            let asset = ComponentTemplates::get(&path).context("Missing component template")?;
            create_file(&directory.join(relative), std::str::from_utf8(&asset.data)?).await?;
        }
        for path in ComponentWit::iter() {
            let asset = ComponentWit::get(&path).context("Missing component host WIT")?;
            create_file(
                &directory.join(".sdk/wit").join(path.as_ref()),
                std::str::from_utf8(&asset.data)?,
            )
            .await?;
        }
    }
    let metadata = format!(
        "name = {}\nversion = \"0.1.0\"\nsdk = {}\nruntime = {}\n\n[dependencies]\n",
        toml::Value::String(name.into()),
        toml::Value::String(sdk.name().into()),
        toml::Value::String(runtime.name().into())
    );
    let metadata = if sdk == Sdk::Elixir {
        metadata.replace("\n[dependencies]", "\nentry = \"Main\"\n\n[dependencies]")
    } else {
        metadata
    };
    create_file(&directory.join(crate::module_manifest::FILE), &metadata).await?;
    Ok(())
}

pub async fn create_file(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .await
        .with_context(|| format!("Creating {} (existing files are preserved)", path.display()))?;
    file.write_all(content.as_bytes()).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::process::Command;

    #[tokio::test]
    async fn rust_starter_resolves_its_nested_inspection_workspace() -> Result<()> {
        let directory = tempfile::tempdir()?;
        write(directory.path(), "inspection-starter", Sdk::Rust).await?;
        let output = Command::new("cargo")
            .args(["metadata", "--no-deps", "--format-version", "1"])
            .current_dir(directory.path())
            .output()
            .await?;
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let metadata: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let root = directory.path().canonicalize()?;
        assert_eq!(metadata["workspace_root"].as_str(), root.to_str());
        assert_eq!(metadata["workspace_members"].as_array().unwrap().len(), 1);
        Ok(())
    }
    #[tokio::test]
    async fn component_starters_exist_for_every_sdk_without_extism_build_tools() -> Result<()> {
        for sdk in [
            Sdk::Rust,
            Sdk::Purescript,
            Sdk::Clojurescript,
            Sdk::Elixir,
            Sdk::Gleam,
            Sdk::Typescript,
            Sdk::Python,
            Sdk::Rescript,
        ] {
            let root = tempfile::tempdir()?;
            write_with_runtime(
                root.path(),
                "component-starter",
                sdk,
                ModuleRuntime::Component,
            )
            .await?;
            assert!(root.path().join(".sdk/wit/runtime.wit").is_file());
            match sdk {
                Sdk::Rust => assert!(
                    !std::fs::read_to_string(root.path().join("Cargo.toml"))?.contains("extism")
                ),
                Sdk::Python => {
                    assert!(root.path().join("build.py").is_file());
                    assert!(
                        !std::fs::read_to_string(root.path().join("plugin.py"))?.contains("extism")
                    );
                }
                Sdk::Elixir => assert!(
                    root.path()
                        .join(".sdk/elixir/lib/fluentci/plugin/component.ex")
                        .is_file()
                ),
                _ => {
                    let build = std::fs::read_to_string(root.path().join("build.mjs"))?;
                    assert!(build.contains("runtime: \"component\""));
                    let package: serde_json::Value =
                        serde_json::from_slice(&std::fs::read(root.path().join("package.json"))?)?;
                    assert!(
                        package["devDependencies"]["@bytecodealliance/componentize-js"].is_string()
                    );
                    assert!(!root.path().join("package-lock.json").exists());
                }
            }
        }
        Ok(())
    }
}
