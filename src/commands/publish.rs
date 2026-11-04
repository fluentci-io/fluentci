use crate::{archive, auth, db::Db, process, registry};
use anyhow::{Context, Result};
use std::path::Path;
use tokio::process::Command;

pub(super) async fn execute(db: &Db, wasm: bool) -> Result<()> {
    let token = auth::token(db).await?;
    let mut request = registry::client()
        .post("https://whole-badger-28.deno.dev")
        .bearer_auth(token);
    if wasm {
        let dir = if Path::new("plugin/Cargo.toml").is_file() {
            Path::new("plugin")
        } else {
            Path::new(".")
        };
        process::execute("rustup", ["target", "add", "wasm32-unknown-unknown"], dir).await?;
        process::execute(
            "cargo",
            ["build", "--release", "--target", "wasm32-unknown-unknown"],
            dir,
        )
        .await?;
        let manifest: toml::Value =
            toml::from_str(&std::fs::read_to_string(dir.join("Cargo.toml"))?)?;
        let name = manifest["package"]["name"]
            .as_str()
            .context("Missing package name")?;
        let version = manifest["package"]["version"]
            .as_str()
            .context("Missing package version")?;
        let output = Command::new("cargo")
            .args(["metadata", "--no-deps", "--format-version=1"])
            .current_dir(dir)
            .output()
            .await?;
        anyhow::ensure!(output.status.success(), "cargo metadata failed");
        let metadata: serde_json::Value = serde_json::from_slice(&output.stdout)?;
        let target = Path::new(
            metadata["target_directory"]
                .as_str()
                .context("Missing target directory")?,
        )
        .join(format!(
            "wasm32-unknown-unknown/release/{}.wasm",
            name.replace('-', "_")
        ));
        request = request
            .header("Content-Type", "application/wasm")
            .header("Name", name)
            .header("Version", version)
            .body(tokio::fs::read(target).await?);
    } else {
        anyhow::ensure!(
            Path::new("mod.ts").is_file() && Path::new("dagger.json").is_file(),
            "A TypeScript package must contain mod.ts and dagger.json"
        );
        let root = std::env::current_dir()?;
        let bytes = tokio::task::spawn_blocking(move || archive::bundle(&root)).await??;
        request = request
            .header("Content-Type", "application/zip")
            .body(bytes);
    }
    request.send().await?.error_for_status()?;
    println!("Package published successfully");
    Ok(())
}
