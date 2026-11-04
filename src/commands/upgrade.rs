use crate::{process, registry};
use anyhow::{Context, Result, bail};

pub(super) async fn execute() -> Result<()> {
    let data: serde_json::Value = registry::client()
        .get("https://api.github.com/repos/fluentci-io/fluentci/releases/latest")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let version = data["tag_name"]
        .as_str()
        .context("Release has no version")?;
    if version.trim_start_matches('v') == env!("CARGO_PKG_VERSION") {
        println!("Already on the latest release");
        return Ok(());
    }
    let os = match std::env::consts::OS {
        "macos" => "apple-darwin",
        "linux" => "unknown-linux-gnu",
        _ => bail!("Upgrade is not supported on this platform"),
    };
    let target = format!("{}-{os}", std::env::consts::ARCH);
    let asset_name = format!("fluentci_{version}_{target}.tar.gz");
    let asset = data["assets"]
        .as_array()
        .context("Release has no assets")?
        .iter()
        .find(|a| a["name"] == asset_name)
        .context("No binary available for this platform")?;
    let url = asset["browser_download_url"]
        .as_str()
        .context("Missing asset URL")?;
    let bytes = registry::client()
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    let temp = tempfile::tempdir()?;
    let archive = temp.path().join("fluentci.tar.gz");
    tokio::fs::write(&archive, bytes).await?;
    process::execute("tar", ["xzf", &archive.to_string_lossy()], temp.path()).await?;
    let current = std::env::current_exe()?;
    let staged = current.with_extension("new");
    tokio::fs::copy(temp.path().join("fluentci"), &staged).await?;
    tokio::fs::rename(staged, current).await?;
    println!("Upgraded to {version}");
    Ok(())
}
