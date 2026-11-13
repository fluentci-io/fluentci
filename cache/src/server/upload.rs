use super::{
    App,
    error::{Failure, Result, backend_error},
    key::Key,
};
use axum::{
    body::Body,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use bytes::{Bytes, BytesMut};
use futures_util::{StreamExt, TryStreamExt, stream::FuturesUnordered};
use object_store::{MultipartUpload, PutPayload};
use sha2::{Digest, Sha256};
use std::sync::atomic::Ordering;

const PART_SIZE: usize = 8 * 1024 * 1024;

/// Aborts uncommitted multipart uploads on errors, disconnects, or cancellation.
struct PendingUpload(Option<Box<dyn MultipartUpload>>);

impl Drop for PendingUpload {
    fn drop(&mut self) {
        if let Some(mut upload) = self.0.take() {
            tokio::spawn(async move {
                if let Err(error) = upload.abort().await {
                    tracing::warn!(%error, "multipart cleanup failed");
                }
            });
        }
    }
}

pub(super) async fn upload(app: &App, key: Key, body: Body) -> Result<Response> {
    let mut stream = body.into_data_stream();
    let mut buffer = BytesMut::new();
    let mut pending = PendingUpload(None);
    let mut parts = FuturesUnordered::new();
    let mut hash = Sha256::new();
    let mut size = 0_u64;
    while let Some(chunk) = stream.next().await {
        let mut chunk =
            chunk.map_err(|_| Failure(StatusCode::BAD_REQUEST, "incomplete request body\n"))?;
        size = size
            .checked_add(chunk.len() as u64)
            .filter(|s| *s <= app.config.max_upload)
            .ok_or(Failure(
                StatusCode::PAYLOAD_TOO_LARGE,
                "upload exceeds limit\n",
            ))?;
        if key.cas.is_some() {
            hash.update(&chunk);
        }
        while !chunk.is_empty() {
            let count = chunk.len().min(PART_SIZE - buffer.len());
            buffer.extend_from_slice(&chunk.split_to(count));
            if buffer.len() == PART_SIZE {
                if pending.0.is_none() {
                    pending.0 = Some(
                        app.store
                            .put_multipart(&key.path)
                            .await
                            .map_err(backend_error)?,
                    );
                }
                while parts.len() >= 2 {
                    parts.try_next().await.map_err(backend_error)?;
                }
                parts.push(
                    pending
                        .0
                        .as_mut()
                        .unwrap()
                        .put_part(buffer.split().freeze().into()),
                );
            }
        }
    }
    if key
        .cas
        .as_ref()
        .is_some_and(|expected| *expected != hex::encode(hash.finalize()))
    {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "CAS SHA-256 digest mismatch\n",
        ));
    }
    let result = if let Some(upload) = pending.0.as_mut() {
        if !buffer.is_empty() {
            parts.push(upload.put_part(buffer.freeze().into()));
        }
        while parts.try_next().await.map_err(backend_error)?.is_some() {}
        let result = upload.complete().await.map_err(backend_error)?;
        pending.0.take();
        result
    } else {
        app.store
            .put(&key.path, PutPayload::from(Bytes::from(buffer)))
            .await
            .map_err(backend_error)?
    };
    app.metrics.writes.fetch_add(1, Ordering::Relaxed);
    app.metrics.bytes_written.fetch_add(size, Ordering::Relaxed);
    let mut response = StatusCode::CREATED.into_response();
    if let Some(etag) = result.e_tag {
        response.headers_mut().insert(
            header::ETAG,
            format!("\"{}\"", etag.trim_matches('"'))
                .parse()
                .map_err(|_| Failure(StatusCode::BAD_GATEWAY, "invalid backend ETag\n"))?,
        );
    }
    Ok(response)
}
