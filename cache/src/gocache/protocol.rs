use anyhow::{Context, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tempfile::TempDir;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
pub(super) struct Request {
    #[serde(rename = "ID")]
    pub(super) id: i64,
    pub(super) command: String,
    #[serde(default, rename = "ActionID")]
    pub(super) action_id: String,
    #[serde(default, rename = "OutputID")]
    pub(super) output_id: String,
    #[serde(default)]
    pub(super) body_size: u64,
}

pub(super) async fn next_request<R: AsyncBufRead + Unpin>(input: &mut R) -> Result<Option<String>> {
    loop {
        let mut line = Vec::new();
        let count = input.take(65537).read_until(b'\n', &mut line).await?;
        ensure!(
            line.len() <= 65536,
            "Go cache request header exceeds 64 KiB"
        );
        if count == 0 {
            return Ok(None);
        }
        let line = String::from_utf8(line)?;
        if !line.trim().is_empty() {
            return Ok(Some(line));
        }
    }
}

pub(super) fn id(value: &str) -> Result<Vec<u8>> {
    let value = STANDARD.decode(value)?;
    ensure!(value.len() == 32, "Go cache IDs must contain 32 bytes");
    Ok(value)
}

pub(super) async fn read_body<R: AsyncBufRead + Unpin>(
    input: &mut R,
    request: &Request,
    directory: &TempDir,
) -> Result<PathBuf> {
    let file = tempfile::NamedTempFile::new_in(directory.path())?;
    let (file, path) = file.keep()?;
    let mut file = tokio::fs::File::from_std(file);
    let mut digest = Sha256::new();
    if request.body_size > 0 {
        // Go inserts whitespace before the separate JSON string containing the body.
        loop {
            let byte = input.read_u8().await?;
            if !byte.is_ascii_whitespace() {
                ensure!(byte == b'"', "expected quoted Go cache body");
                break;
            }
        }
        let mut remaining = request
            .body_size
            .div_ceil(3)
            .checked_mul(4)
            .context("body size overflow")?;
        let mut buffer = vec![0; 64 * 1024];
        let mut decoded_size = 0_u64;
        while remaining > 0 {
            let count = remaining.min(buffer.len() as u64) as usize;
            input.read_exact(&mut buffer[..count]).await?;
            let decoded = STANDARD.decode(&buffer[..count])?;
            decoded_size += decoded.len() as u64;
            digest.update(&decoded);
            file.write_all(&decoded).await?;
            remaining -= count as u64;
        }
        ensure!(input.read_u8().await? == b'"', "missing body closing quote");
        ensure!(
            decoded_size == request.body_size,
            "Go cache body size mismatch"
        );
    }
    ensure!(
        id(&request.output_id)? == digest.finalize().as_slice(),
        "Go cache output digest mismatch"
    );
    file.flush().await?;
    Ok(path)
}
