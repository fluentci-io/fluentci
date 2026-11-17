use anyhow::{bail, ensure, Context, Result};
use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use reqwest::{header, Client, Response, StatusCode, Url};
use std::{
    io::{ErrorKind, IsTerminal, SeekFrom},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    fs::OpenOptions,
    io::{AsyncSeekExt, AsyncWriteExt},
    task::JoinSet,
};

const CHUNK_SIZE: u64 = 8 * 1024 * 1024;

#[cfg(test)]
mod tests;

struct Progress(ProgressBar);

impl Drop for Progress {
    fn drop(&mut self) {
        if !self.0.is_finished() {
            self.0.abandon_with_message("Cache download interrupted");
        }
    }
}

pub(super) async fn restore(url: Url, path: &Path) -> Result<bool> {
    let jobs = match std::env::var("FLUENTCI_CACHE_DOWNLOAD_JOBS") {
        Ok(value) => value
            .parse::<usize>()
            .context("Invalid FLUENTCI_CACHE_DOWNLOAD_JOBS")?,
        Err(std::env::VarError::NotPresent) => 4,
        Err(error) => return Err(error.into()),
    };
    ensure!(
        (1..=32).contains(&jobs),
        "Cache download jobs must be between 1 and 32"
    );
    transfer(url, path, jobs, CHUNK_SIZE).await
}

async fn transfer(url: Url, destination: &Path, jobs: usize, chunk_size: u64) -> Result<bool> {
    ensure!(
        matches!(url.scheme(), "http" | "https")
            && url.username().is_empty()
            && url.password().is_none(),
        "Cache URL must be HTTP(S) without embedded credentials"
    );
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(300))
        .pool_max_idle_per_host(jobs)
        .build()?;
    let mut response = client
        .get(url.clone())
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(reqwest::Error::without_url)?;
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(false);
    }
    let mut ranged = None;
    let empty = response.status() == StatusCode::RANGE_NOT_SATISFIABLE
        && response
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            == Some("bytes */0");
    if response.status() == StatusCode::PARTIAL_CONTENT {
        let total = content_range(&response, 0, 0)?;
        let validator = response.headers().get(header::ETAG).cloned().filter(|v| {
            v.to_str()
                .is_ok_and(|v| v.starts_with('"') && v.ends_with('"'))
        });
        let mut received = 0;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(reqwest::Error::without_url)?
        {
            received += chunk.len();
            ensure!(received <= 1, "Cache range probe exceeded one byte");
        }
        ensure!(received == 1, "Truncated cache range probe");
        if let Some(validator) = validator.filter(|_| total > chunk_size && jobs > 1) {
            ranged = Some((total, validator));
        } else {
            response = client
                .get(url.clone())
                .header(header::ACCEPT_ENCODING, "identity")
                .send()
                .await
                .map_err(reqwest::Error::without_url)?;
            if response.status() == StatusCode::NOT_FOUND {
                return Ok(false);
            }
        }
    }
    if ranged.is_none() && !empty {
        ensure!(
            response.status() == StatusCode::OK,
            "Cache download returned HTTP {}",
            response.status()
        );
        identity_encoding(&response)?;
    }
    let total = if empty {
        Some(0)
    } else {
        ranged
            .as_ref()
            .map(|v| v.0)
            .or_else(|| response.content_length())
    };
    let progress = Progress(progress(total, destination)?);
    let directory = destination
        .parent()
        .context("Cache destination has no parent directory")?;
    tokio::fs::create_dir_all(directory).await?;
    let temporary = tempfile::Builder::new()
        .prefix(".cache-download-")
        .tempfile_in(directory)?;
    if let Some((total, etag)) = ranged {
        parallel(
            &client,
            &url,
            temporary.path(),
            jobs,
            chunk_size,
            (total, etag),
            &progress.0,
        )
        .await?;
    } else if !empty {
        let mut output = OpenOptions::new()
            .write(true)
            .open(temporary.path())
            .await?;
        stream_to_file(response, &mut output, total, &progress.0).await?;
        output.sync_all().await?;
    }
    match temporary.persist_noclobber(destination) {
        Ok(_) => {}
        Err(error) if error.error.kind() == ErrorKind::AlreadyExists && destination.is_file() => {}
        Err(error) => return Err(error.error.into()),
    }
    progress.0.finish_with_message("Cache downloaded");
    Ok(true)
}

fn progress(total: Option<u64>, destination: &Path) -> Result<ProgressBar> {
    let (progress, template) = match total {
        Some(total) => (ProgressBar::new(total), "{msg} [{wide_bar:.cyan/blue}] {percent:>3}% {bytes}/{total_bytes} ({bytes_per_sec}, ETA {eta})"),
        None => (ProgressBar::new_spinner(), "{spinner:.cyan} {msg} {bytes} ({bytes_per_sec})"),
    };
    if !std::io::stderr().is_terminal() {
        progress.set_draw_target(ProgressDrawTarget::hidden());
    }
    progress.set_style(ProgressStyle::with_template(template)?.progress_chars("=>-"));
    progress.set_message(format!(
        "Downloading {}",
        destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
    ));
    progress.enable_steady_tick(Duration::from_millis(100));
    Ok(progress)
}

fn identity_encoding(response: &Response) -> Result<()> {
    ensure!(
        response
            .headers()
            .get(header::CONTENT_ENCODING)
            .is_none_or(|v| v == "identity"),
        "Cache response must use identity encoding"
    );
    Ok(())
}

fn content_range(response: &Response, start: u64, end: u64) -> Result<u64> {
    identity_encoding(response)?;
    let value = response
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .context("Cache response has no Content-Range")?;
    let (range, total) = value
        .strip_prefix("bytes ")
        .and_then(|v| v.split_once('/'))
        .context("Invalid cache Content-Range")?;
    ensure!(
        range == format!("{start}-{end}"),
        "Cache server returned a different byte range"
    );
    let total: u64 = total.parse().context("Invalid cache object size")?;
    ensure!(
        total > end && total <= i64::MAX as u64,
        "Invalid cache object size"
    );
    Ok(total)
}

async fn stream_to_file(
    mut response: Response,
    output: &mut tokio::fs::File,
    expected: Option<u64>,
    progress: &ProgressBar,
) -> Result<()> {
    let mut received = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(reqwest::Error::without_url)?
    {
        received = received
            .checked_add(chunk.len() as u64)
            .context("Cache response size overflow")?;
        ensure!(
            expected.is_none_or(|size| received <= size),
            "Cache response exceeds expected size"
        );
        output.write_all(&chunk).await?;
        progress.inc(chunk.len() as u64);
    }
    ensure!(
        expected.is_none_or(|size| received == size),
        "Truncated cache response"
    );
    output.flush().await?;
    Ok(())
}

async fn parallel(
    client: &Client,
    url: &Url,
    path: &Path,
    jobs: usize,
    chunk_size: u64,
    version: (u64, header::HeaderValue),
    progress: &ProgressBar,
) -> Result<()> {
    let (total, etag) = version;
    let output = OpenOptions::new().write(true).open(path).await?;
    output.set_len(total).await?;
    drop(output);
    let next = Arc::new(AtomicU64::new(0));
    let mut tasks = JoinSet::new();
    for _ in 0..jobs.min(total.div_ceil(chunk_size) as usize) {
        let (client, url, path, next, etag, progress) = (
            client.clone(),
            url.clone(),
            PathBuf::from(path),
            next.clone(),
            etag.clone(),
            progress.clone(),
        );
        tasks.spawn(async move {
            let mut file = OpenOptions::new().write(true).open(path).await?;
            loop {
                let start = next.fetch_add(chunk_size, Ordering::Relaxed);
                if start >= total {
                    break;
                }
                let end = (start + chunk_size - 1).min(total - 1);
                let response = client
                    .get(url.clone())
                    .header(header::ACCEPT_ENCODING, "identity")
                    .header(header::RANGE, format!("bytes={start}-{end}"))
                    .header(header::IF_MATCH, etag.clone())
                    .send()
                    .await
                    .map_err(reqwest::Error::without_url)?;
                ensure!(
                    response.status() == StatusCode::PARTIAL_CONTENT,
                    "Cache range request returned HTTP {}",
                    response.status()
                );
                ensure!(
                    content_range(&response, start, end)? == total
                        && response.headers().get(header::ETAG) == Some(&etag),
                    "Cache object changed during download"
                );
                file.seek(SeekFrom::Start(start)).await?;
                stream_to_file(response, &mut file, Some(end - start + 1), &progress).await?;
            }
            file.sync_all().await?;
            Ok::<_, anyhow::Error>(())
        });
    }
    while let Some(result) = tasks.join_next().await {
        let result = result
            .context("Cache download task panicked")
            .and_then(|v| v);
        if let Err(error) = result {
            tasks.abort_all();
            while tasks.join_next().await.is_some() {}
            bail!(error);
        }
    }
    Ok(())
}
