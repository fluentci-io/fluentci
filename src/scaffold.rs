//! Embed SDK starter projects independently of the developer's checkout.

use crate::config::Sdk;
use anyhow::{Context, Result};
use rust_embed::RustEmbed;
use std::path::Path;
use tokio::io::AsyncWriteExt;

#[derive(RustEmbed)]
#[folder = "templates/sdk/"]
struct Templates;

pub async fn write(directory: &Path, name: &str, sdk: Sdk) -> Result<()> {
    if sdk == Sdk::Rust {
        let manifest = format!(
            "[package]\nname = {}\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n\n[dependencies]\nextism-pdk = \"=1.4.1\"\n\n[workspace]\n",
            toml::Value::String(name.into())
        );
        create_file(&directory.join("Cargo.toml"), &manifest).await?;
        create_file(&directory.join("src/lib.rs"), "use extism_pdk::*;\n\n#[plugin_fn]\npub fn hello() -> FnResult<String> {\n    Ok(\"Hello from FluentCI\".into())\n}\n").await?;
        create_file(&directory.join(".gitignore"), "/target/\n").await?;
    } else {
        let prefix = format!("{}/", sdk.name());
        for path in Templates::iter().filter(|path| path.starts_with(&prefix)) {
            let relative = path
                .strip_prefix(&prefix)
                .context("Invalid SDK template path")?;
            let asset = Templates::get(&path).context("Missing embedded SDK template")?;
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
