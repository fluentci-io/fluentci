use super::{
    ContextState,
    protocol::{Request, id},
};
use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::{StreamExt, TryStreamExt, stream};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::io::{ReaderStream, StreamReader};

pub(super) async fn execute(
    context: &ContextState,
    request: &Request,
    file: Option<PathBuf>,
) -> Result<Value> {
    let action = hex::encode(id(&request.action_id)?);
    let url = format!(
        "{}/gocache/{action}",
        context.config.url.trim_end_matches('/')
    );
    let auth = |builder: reqwest::RequestBuilder| match &context.config.token {
        Some(token) => builder.bearer_auth(token),
        None => builder,
    };
    match request.command.as_str() {
        "put" => {
            let path = file.context("missing Go cache body")?;
            let output = id(&request.output_id)?;
            let file = tokio::fs::File::open(&path).await?;
            // Single atomic remote object: 32-byte output ID followed by the payload.
            let prefix =
                stream::once(async { Ok::<_, std::io::Error>(bytes::Bytes::from(output)) });
            let body = reqwest::Body::wrap_stream(prefix.chain(ReaderStream::new(file)));
            auth(context.client.put(url))
                .header("content-length", request.body_size + 32)
                .body(body)
                .send()
                .await?
                .error_for_status()?;
            Ok(json!({"ID": request.id, "DiskPath": path}))
        }
        "get" => {
            let response = auth(context.client.get(url)).send().await?;
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                return Ok(json!({"ID": request.id, "Miss": true}));
            }
            let response = response.error_for_status()?;
            let mut reader =
                StreamReader::new(response.bytes_stream().map_err(std::io::Error::other));
            let mut output_id = [0_u8; 32];
            reader
                .read_exact(&mut output_id)
                .await
                .context("invalid remote Go cache envelope")?;
            let file = tempfile::NamedTempFile::new_in(context.files.path())?;
            let (file, path) = file.keep()?;
            let mut file = tokio::fs::File::from_std(file);
            let mut digest = Sha256::new();
            let mut size = 0_u64;
            let mut buffer = vec![0; 64 * 1024];
            loop {
                let count = reader.read(&mut buffer).await?;
                if count == 0 {
                    break;
                }
                size += count as u64;
                ensure!(
                    size <= context.config.max_object,
                    "remote Go cache object exceeds helper limit"
                );
                digest.update(&buffer[..count]);
                file.write_all(&buffer[..count]).await?;
            }
            ensure!(
                digest.finalize().as_slice() == output_id,
                "remote Go cache digest mismatch"
            );
            file.flush().await?;
            Ok(
                json!({"ID": request.id, "OutputID": STANDARD.encode(output_id), "Size": size, "DiskPath": path}),
            )
        }
        command => bail!("unsupported Go cache command: {command}"),
    }
}
