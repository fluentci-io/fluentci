//! Compressed, replayable uploads. Retries never accept a different artifact.

use super::{Upload, wasm_url};
use crate::{
    auth::Publisher,
    progress::{Transfer, with_progress, with_transfer},
    registry,
};
use anyhow::{Context, Result, ensure};
use flate2::{Compression, write::GzEncoder};
use std::{future::Future, io::Write, sync::Arc, time::Duration};

const UPLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const ATTEMPTS: usize = 3;

struct Payload {
    bytes: Arc<[u8]>,
    gzip: bool,
}

fn compress(bytes: Vec<u8>) -> Result<Payload> {
    if bytes.len() >= 256 * 1024 {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&bytes)?;
        let encoded = encoder.finish()?;
        if encoded.len() < bytes.len() * 9 / 10 {
            return Ok(Payload {
                bytes: encoded.into(),
                gzip: true,
            });
        }
    }
    Ok(Payload {
        bytes: bytes.into(),
        gzip: false,
    })
}

pub(super) async fn publish(
    publisher: &Publisher,
    name: &str,
    version: &str,
    bytes: Vec<u8>,
    digest: &str,
) -> Result<String> {
    let size = bytes.len();
    let payload = with_progress("Preparing compressed upload", async move {
        tokio::task::spawn_blocking(move || compress(bytes)).await?
    })
    .await?;
    let transfer = Transfer::new(Some(payload.bytes.len() as u64));
    let endpoint = format!("{}/xrpc/io.fluentci.registry.publish", registry::base_url());
    let request = Request {
        client: registry::client(),
        endpoint: &endpoint,
        name,
        version,
        payload: &payload,
        digest,
        size,
        transfer: &transfer,
    };
    with_transfer(
        &format!("Uploading {name}@{version}"),
        &format!("Finalizing upload {name}@{version}"),
        &transfer,
        request.send(
            || publisher.upload_token(),
            UPLOAD_TIMEOUT,
            Duration::from_secs(1),
        ),
    )
    .await
}

struct Request<'a> {
    client: &'a reqwest::Client,
    endpoint: &'a str,
    name: &'a str,
    version: &'a str,
    payload: &'a Payload,
    digest: &'a str,
    size: usize,
    transfer: &'a Transfer,
}

impl Request<'_> {
    async fn send<F, T>(&self, token: F, timeout: Duration, retry_delay: Duration) -> Result<String>
    where
        F: Fn() -> T,
        T: Future<Output = Result<String>>,
    {
        let Self {
            client,
            endpoint,
            name,
            version,
            payload,
            digest,
            size,
            transfer,
        } = *self;
        for attempt in 0..ATTEMPTS {
            // Each attempt gets a fresh publisher-issued, method-scoped JWT.
            let token = tokio::time::timeout(Duration::from_secs(30), token())
                .await
                .context("Publisher upload authorization timed out")??;
            transfer.reset();
            let mut request = client
                .post(endpoint)
                .bearer_auth(token)
                .query(&[("name", name), ("version", version)])
                .header("Content-Type", "application/wasm")
                .header(reqwest::header::CONTENT_LENGTH, payload.bytes.len())
                .body(transfer.upload_body(payload.bytes.clone()))
                .timeout(timeout);
            if payload.gzip {
                request = request.header(reqwest::header::CONTENT_ENCODING, "gzip");
            }
            let response = match request.send().await {
            Ok(response) => response,
            Err(error) if (error.is_timeout() || error.is_connect() || error.is_body() || error.is_request()) && attempt + 1 < ATTEMPTS => {
                tracing::warn!(attempt = attempt + 1, "Upload interrupted; retrying the same artifact");
                tokio::time::sleep(retry_delay * (1 << attempt)).await;
                continue;
            }
            Err(error) => return Err(error).context("Module upload failed after retrying; re-run publish to safely reuse an already-stored identical artifact"),
        };
            let status = response.status();
            if matches!(
                status.as_u16(),
                408 | 425 | 429 | 500 | 502 | 503 | 504 | 520 | 522 | 524
            ) && attempt + 1 < ATTEMPTS
            {
                let delay = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .map(|seconds| Duration::from_secs(seconds.min(30)))
                    .unwrap_or(retry_delay * (1 << attempt));
                tracing::warn!(%status, attempt = attempt + 1, "Registry temporarily unavailable; retrying upload");
                tokio::time::sleep(delay).await;
                continue;
            }
            if !status.is_success() {
                let message = response.text().await.unwrap_or_default();
                let detail = serde_json::from_str::<serde_json::Value>(&message)
                    .ok()
                    .and_then(|body| {
                        body.get("message")
                            .and_then(|value| value.as_str())
                            .map(str::to_owned)
                    })
                    .unwrap_or_else(|| status.to_string());
                anyhow::bail!("Registry upload failed ({status}): {detail}");
            }
            let upload: Upload = match response.json().await {
            Ok(upload) => upload,
            Err(error) if (error.is_timeout() || error.is_body()) && attempt + 1 < ATTEMPTS => {
                tracing::warn!(attempt = attempt + 1, "Upload response interrupted; recovering the stored artifact");
                tokio::time::sleep(retry_delay * (1 << attempt)).await;
                continue;
            }
            Err(error) => return Err(error).context("Registry upload response was interrupted or invalid; re-run publish to recover the stored artifact"),
        };
            wasm_url(&upload.url)?;
            ensure!(
                upload.sha256 == digest && upload.size == size,
                "Registry upload checksum or size did not match the Wasm artifact"
            );
            return Ok(upload.url);
        }
        unreachable!("every final attempt returns a result")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json, Router,
        body::Bytes,
        extract::State,
        http::{HeaderMap, StatusCode},
        routing::post,
    };
    use flate2::read::GzDecoder;
    use std::{
        io::Read,
        sync::{
            Mutex,
            atomic::{AtomicUsize, Ordering},
        },
    };

    type Received = Arc<Mutex<Vec<(String, Vec<u8>)>>>;

    #[test]
    fn compression_reduces_wire_bytes_without_changing_the_artifact() -> Result<()> {
        let original = b"wasm component content and metadata\n".repeat(30_000);
        let payload = compress(original.clone())?;
        assert!(payload.gzip);
        assert!(payload.bytes.len() < original.len() / 2);
        let mut decoded = Vec::new();
        GzDecoder::new(payload.bytes.as_ref()).read_to_end(&mut decoded)?;
        assert_eq!(decoded, original);
        let small = compress(b"small".to_vec())?;
        assert!(!small.gzip);
        assert_eq!(small.bytes.as_ref(), b"small");
        Ok(())
    }

    #[tokio::test]
    async fn interrupted_upload_retries_identical_compressed_bytes_with_fresh_auth() -> Result<()> {
        let bytes = b"native wasm payload\n".repeat(30_000);
        let digest = sha256::digest(&bytes);
        let payload = compress(bytes.clone())?;
        let received = Arc::new(Mutex::new(Vec::new()));
        let request_count = Arc::new(AtomicUsize::new(0));
        let app = Router::new().route("/upload", post({
            let digest = digest.clone();
            let count = request_count.clone();
            let size = bytes.len();
            move |State(received): State<Received>, headers: HeaderMap, body: Bytes| {
                let digest = digest.clone();
                let count = count.clone();
                async move {
                    assert_eq!(headers["content-encoding"], "gzip");
                    received.lock().unwrap().push((headers["authorization"].to_str().unwrap().to_owned(), body.to_vec()));
                    if count.fetch_add(1, Ordering::SeqCst) == 0 {
                        (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"message":"temporary failure"})))
                    } else {
                        (StatusCode::OK, Json(serde_json::json!({"url":"https://example.com/module.wasm", "sha256":digest,"size":size})))
                    }
                }
            }
        })).with_state(received.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let endpoint = format!("http://{}/upload", listener.local_addr()?);
        let server = tokio::spawn(async move { axum::serve(listener, app).await });
        let transfer = Transfer::new(None);
        let request = Request {
            client: registry::client(),
            endpoint: &endpoint,
            name: "example",
            version: "1.0.0",
            payload: &payload,
            digest: &digest,
            size: bytes.len(),
            transfer: &transfer,
        };
        let minted = AtomicUsize::new(0);
        let result = request
            .send(
                || {
                    std::future::ready(Ok(format!(
                        "token-{}",
                        minted.fetch_add(1, Ordering::SeqCst)
                    )))
                },
                Duration::from_secs(5),
                Duration::ZERO,
            )
            .await;
        server.abort();
        assert_eq!(result?, "https://example.com/module.wasm");
        let received = received.lock().unwrap();
        assert_eq!(received.len(), 2);
        assert_ne!(received[0].0, received[1].0);
        assert_eq!(received[0].1, received[1].1);
        let mut decoded = Vec::new();
        GzDecoder::new(received[1].1.as_slice()).read_to_end(&mut decoded)?;
        assert_eq!(decoded, bytes);
        Ok(())
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use axum::{Json, Router, http::StatusCode, routing::post};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn timeout_retries_but_permanent_rejection_does_not() -> Result<()> {
        for reject in [false, true] {
            let count = Arc::new(AtomicUsize::new(0));
            let bytes = b"module payload".to_vec();
            let size = bytes.len();
            let digest = sha256::digest(&bytes);
            let app = Router::new().route("/upload", post({
                let count = count.clone();
                let digest = digest.clone();
                move || {
                    let count = count.clone();
                    let digest = digest.clone();
                    async move {
                        let first = count.fetch_add(1, Ordering::SeqCst) == 0;
                        if reject {
                            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"message":"invalid module"})));
                        }
                        if first { tokio::time::sleep(Duration::from_secs(1)).await; }
                        (StatusCode::OK, Json(serde_json::json!({"url":"https://example.com/module.wasm","sha256":digest,"size":size})))
                    }
                }
            }));
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
            let endpoint = format!("http://{}/upload", listener.local_addr()?);
            let server = tokio::spawn(async move { axum::serve(listener, app).await });
            let payload = compress(bytes)?;
            let transfer = Transfer::new(None);
            let request = Request {
                client: registry::client(),
                endpoint: &endpoint,
                name: "example",
                version: "1.0.0",
                payload: &payload,
                digest: &digest,
                size,
                transfer: &transfer,
            };
            let result = request
                .send(
                    || std::future::ready(Ok("token".into())),
                    Duration::from_millis(250),
                    Duration::ZERO,
                )
                .await;
            server.abort();
            if reject {
                assert!(result.unwrap_err().to_string().contains("invalid module"));
                assert_eq!(count.load(Ordering::SeqCst), 1);
            } else {
                assert!(result.is_ok(), "{result:?}");
                assert_eq!(count.load(Ordering::SeqCst), 2);
            }
        }
        Ok(())
    }
}
