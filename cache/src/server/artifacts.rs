//! Atomic artifact pointers for cache protocols with immutable keys or response metadata.
use super::{
    App,
    download::download,
    error::{Failure, Result, backend_error},
    key::Key,
    upload::upload,
};
use axum::{
    body::Body,
    http::{HeaderMap, StatusCode},
    response::Response,
};
use bytes::Bytes;
use object_store::{ObjectStore, PutMode, PutOptions, path::Path};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::OwnedSemaphorePermit;

#[derive(Serialize, Deserialize)]
pub(super) struct Artifact {
    pub path: String,
    pub size: u64,
    pub headers: BTreeMap<String, String>,
}

struct PendingObject {
    store: Arc<dyn ObjectStore>,
    path: Path,
    committed: bool,
}

impl Drop for PendingObject {
    fn drop(&mut self) {
        if !self.committed {
            let store = self.store.clone();
            let path = self.path.clone();
            tokio::spawn(async move {
                let _ = store.delete(&path).await;
            });
        }
    }
}

pub(super) fn valid_hash(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

pub(super) fn pointer(account: &str, protocol: &str, hash: &str) -> Result<Path> {
    if !valid_hash(hash) {
        return Err(Failure(StatusCode::BAD_REQUEST, "invalid artifact hash\n"));
    }
    Ok(Path::parse(format!("accounts/{account}/{protocol}/{hash}"))
        .expect("validated cache storage path"))
}

pub(super) async fn metadata(
    app: &App,
    account: &str,
    protocol: &str,
    hash: &str,
) -> Result<Artifact> {
    let result = app
        .reader
        .get(&pointer(account, protocol, hash)?)
        .await
        .map_err(backend_error)?;
    if result.meta.size > 16384 {
        return Err(Failure(
            StatusCode::BAD_GATEWAY,
            "invalid artifact metadata\n",
        ));
    }
    let data: Artifact = serde_json::from_slice(&result.bytes().await.map_err(backend_error)?)
        .map_err(|_| Failure(StatusCode::BAD_GATEWAY, "invalid artifact metadata\n"))?;
    let prefix = format!("accounts/{account}/_artifacts/{protocol}/{hash}/");
    if !data.path.starts_with(&prefix)
        || Path::parse(&data.path).is_err()
        || data
            .path
            .split('/')
            .any(|s| s == "." || s == ".." || s.is_empty())
    {
        return Err(Failure(
            StatusCode::BAD_GATEWAY,
            "invalid artifact metadata\n",
        ));
    }
    Ok(data)
}

pub(super) async fn get(
    app: &App,
    account: &str,
    protocol: &str,
    hash: &str,
    headers: &HeaderMap,
    head: bool,
    permit: OwnedSemaphorePermit,
) -> Result<Response> {
    let artifact = metadata(app, account, protocol, hash).await?;
    let key = Key {
        path: Path::parse(&artifact.path)
            .map_err(|_| Failure(StatusCode::BAD_GATEWAY, "invalid artifact metadata\n"))?,
        account: Some(account.into()),
        cas: None,
        content_type: "application/octet-stream",
        nix_info: false,
    };
    let mut response = download(app, key, headers, head, permit).await?;
    for (name, value) in artifact.headers {
        if matches!(
            name.as_str(),
            "x-artifact-duration" | "x-artifact-tag" | "x-artifact-sha" | "x-artifact-dirty-hash"
        ) {
            response.headers_mut().insert(
                axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                value
                    .parse()
                    .map_err(|_| Failure(StatusCode::BAD_GATEWAY, "invalid artifact header\n"))?,
            );
        }
    }
    Ok(response)
}

pub(super) async fn put(
    app: &App,
    target: (&str, &str, &str),
    headers: BTreeMap<String, String>,
    expected: u64,
    body: Body,
    immutable: bool,
) -> Result<()> {
    let (account, protocol, hash) = target;
    let index = pointer(account, protocol, hash)?;
    let path = Path::parse(format!(
        "accounts/{account}/_artifacts/{protocol}/{hash}/{}",
        uuid::Uuid::new_v4()
    ))
    .expect("validated cache storage path");
    let mut pending = PendingObject {
        store: app.store.clone(),
        path: path.clone(),
        committed: false,
    };
    let key = Key {
        path: path.clone(),
        account: Some(account.into()),
        cas: None,
        content_type: "application/octet-stream",
        nix_info: false,
    };
    upload(app, key, body).await?;
    let size = app.store.head(&path).await.map_err(backend_error)?.size;
    if size != expected {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "content length mismatch\n",
        ));
    }
    let artifact = Artifact {
        path: path.to_string(),
        size,
        headers,
    };
    let bytes = serde_json::to_vec(&artifact).expect("serializable artifact metadata");
    app.store
        .put_opts(
            &index,
            Bytes::from(bytes).into(),
            PutOptions {
                mode: if immutable {
                    PutMode::Create
                } else {
                    PutMode::Overwrite
                },
                ..Default::default()
            },
        )
        .await
        .map_err(|error| match error {
            object_store::Error::AlreadyExists { .. }
            | object_store::Error::Precondition { .. } => {
                Failure(StatusCode::CONFLICT, "artifact already exists\n")
            }
            error => backend_error(error),
        })?;
    pending.committed = true;
    Ok(())
}
