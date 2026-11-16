use crate::{process, registry};
use anyhow::{Context, Result, bail};
use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use std::{io::IsTerminal, path::Path, time::Duration};
use tokio::io::AsyncWriteExt;

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
    let os = platform_suffix(std::env::consts::OS, cfg!(target_env = "musl"))?;
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
    let response = registry::client()
        .get(url)
        .send()
        .await?
        .error_for_status()?;
    let temp = tempfile::tempdir()?;
    let archive = temp.path().join("fluentci.tar.gz");
    eprintln!("Downloading {version}");
    let progress = download_progress(response.content_length(), version)?;
    if let Err(error) = download_archive(response, &archive, &progress).await {
        progress.abandon_with_message("Download failed");
        return Err(error);
    }
    progress.finish_with_message(format!("Downloaded {version}"));
    eprintln!("Installing {version}");
    process::execute("tar", ["xzf", &archive.to_string_lossy()], temp.path()).await?;
    let current = crate::process::current_exe()?;
    let staged = current.with_extension("new");
    tokio::fs::copy(temp.path().join("fluentci"), &staged).await?;
    tokio::fs::rename(staged, current).await?;
    println!("Upgraded to {version}");
    Ok(())
}

fn download_progress(total: Option<u64>, version: &str) -> Result<ProgressBar> {
    let (progress, template) = match total {
        Some(total) => (
            ProgressBar::new(total),
            "{msg} [{wide_bar:.cyan/blue}] {percent:>3}% {bytes}/{total_bytes} ({bytes_per_sec}, ETA {eta})",
        ),
        None => (
            ProgressBar::new_spinner(),
            "{spinner:.cyan} {msg} {bytes} ({bytes_per_sec})",
        ),
    };
    if !std::io::stderr().is_terminal() {
        progress.set_draw_target(ProgressDrawTarget::hidden());
    }
    progress.set_style(ProgressStyle::with_template(template)?.progress_chars("=>-"));
    progress.set_message(format!("Downloading {version}"));
    progress.enable_steady_tick(Duration::from_millis(100));
    Ok(progress)
}

async fn download_archive(
    mut response: reqwest::Response,
    archive: &Path,
    progress: &ProgressBar,
) -> Result<()> {
    let mut file = tokio::fs::File::create(archive)
        .await
        .context("Could not create upgrade archive")?;
    while let Some(chunk) = response.chunk().await.context("Upgrade download failed")? {
        file.write_all(&chunk)
            .await
            .context("Could not write upgrade archive")?;
        progress.inc(chunk.len() as u64);
    }
    file.flush()
        .await
        .context("Could not flush upgrade archive")?;
    Ok(())
}

fn platform_suffix(os: &str, musl: bool) -> Result<&'static str> {
    Ok(match os {
        "macos" => "apple-darwin",
        "linux" if musl => "unknown-linux-musl",
        "linux" => "unknown-linux-gnu",
        "freebsd" => "unknown-freebsd",
        "netbsd" => "unknown-netbsd",
        "openbsd" => "unknown-openbsd",
        _ => bail!("Upgrade is not supported on this platform"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    async fn download_response(body: &'static [u8]) -> Result<reqwest::Response> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await?;
            let mut request = vec![];
            while !request.ends_with(b"\r\n\r\n") {
                request.push(stream.read_u8().await?);
            }
            stream.write_all(body).await?;
            stream.shutdown().await
        });
        reqwest::Client::new()
            .get(format!("http://{address}/archive"))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .context("Could not fetch test archive")
    }

    #[tokio::test]
    async fn upgrade_streams_archive_and_counts_downloaded_bytes() -> Result<()> {
        let response = download_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\narchive-data",
        )
        .await?;
        let progress = download_progress(response.content_length(), "v1.0.0")?;
        let temp = tempfile::tempdir()?;
        let archive = temp.path().join("archive");
        download_archive(response, &archive, &progress).await?;
        assert_eq!(tokio::fs::read(archive).await?, b"archive-data");
        assert_eq!(progress.position(), 12);
        assert_eq!(progress.length(), Some(12));
        progress.finish_and_clear();
        Ok(())
    }

    #[tokio::test]
    async fn upgrade_handles_downloads_without_a_total_size() -> Result<()> {
        let response = download_response(
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n7\r\narchive\r\n5\r\n-data\r\n0\r\n\r\n",
        )
        .await?;
        let progress = download_progress(response.content_length(), "v1.0.0")?;
        let temp = tempfile::tempdir()?;
        let archive = temp.path().join("archive");
        download_archive(response, &archive, &progress).await?;
        assert_eq!(tokio::fs::read(archive).await?, b"archive-data");
        assert_eq!(progress.position(), 12);
        assert_eq!(progress.length(), None);
        progress.finish_and_clear();
        Ok(())
    }

    #[tokio::test]
    async fn upgrade_rejects_truncated_downloads() -> Result<()> {
        let response = download_response(
            b"HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\nshort",
        )
        .await?;
        let progress = download_progress(response.content_length(), "v1.0.0")?;
        let temp = tempfile::tempdir()?;
        let error = download_archive(response, &temp.path().join("archive"), &progress)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("Upgrade download failed"));
        assert!(progress.position() < 12);
        progress.abandon();
        Ok(())
    }

    #[test]
    fn upgrade_keeps_the_compiled_libc_variant() -> Result<()> {
        assert_eq!(platform_suffix("linux", true)?, "unknown-linux-musl");
        assert_eq!(platform_suffix("linux", false)?, "unknown-linux-gnu");
        assert_eq!(platform_suffix("macos", false)?, "apple-darwin");
        assert!(platform_suffix("windows", false).is_err());
        Ok(())
    }
}
