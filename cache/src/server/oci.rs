//! OCI Distribution push/pull endpoints used by BuildKit registry caches.
use super::{
    App,
    auth::{authorized, upload_authorized},
    download::download,
    error::{Failure, Result, backend_error},
    key::{Key, key},
    staging::Allocation,
    upload::upload,
};
use axum::{
    Json,
    body::to_bytes,
    extract::{Path as UrlPath, Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::any,
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use futures_util::StreamExt;
use object_store::path::Path;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{io::AsyncWriteExt, sync::Mutex};
use tokio_util::io::ReaderStream;

#[derive(Clone)]
struct Registry {
    app: Arc<App>,
    uploads: Arc<Mutex<HashMap<String, Arc<Mutex<Session>>>>>,
}

struct Session {
    account: String,
    repository: String,
    path: tempfile::TempPath,
    size: u64,
    updated: Instant,
    allocation: Allocation,
}

pub(super) fn router(app: Arc<App>) -> axum::Router {
    axum::Router::new()
        .route("/v2", any(root))
        .route("/v2/", any(root))
        .route("/v2/{*rest}", any(handle))
        .with_state(Registry {
            app,
            uploads: Arc::default(),
        })
}

fn digest(value: &str) -> Result<&str> {
    value
        .strip_prefix("sha256:")
        .filter(|hash| {
            hash.len() == 64
                && hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
        .ok_or(Failure(StatusCode::BAD_REQUEST, "expected sha256 digest\n"))
}

fn object(account: &str, repo: &str, kind: &str, value: &str) -> Path {
    Path::parse(format!("accounts/{account}/oci/{repo}/{kind}/{value}"))
        .expect("validated cache storage path")
}

fn blob(account: &str, repo: &str, hash: &str) -> Path {
    object(account, repo, "blobs/sha256", hash)
}

fn api_blob(account: &str, repo: &str, hash: &str) -> String {
    let account = super::aliases::registry_account(account);
    format!("/v2/accounts/{account}/{repo}/blobs/sha256:{hash}")
}

fn reply(status: StatusCode) -> Response {
    status.into_response()
}

fn set(response: &mut Response, name: &str, value: &str) -> Result<()> {
    response.headers_mut().insert(
        header::HeaderName::from_bytes(name.as_bytes()).expect("static header"),
        value
            .parse()
            .map_err(|_| Failure(StatusCode::BAD_GATEWAY, "invalid backend header\n"))?,
    );
    Ok(())
}

fn finish(result: Result<Response>) -> Response {
    let mut response = match result {
        Ok(response) => response,
        Err(error) => {
            let code = match error.0 {
                StatusCode::UNAUTHORIZED => "UNAUTHORIZED",
                StatusCode::FORBIDDEN => "DENIED",
                StatusCode::NOT_FOUND => "BLOB_UNKNOWN",
                StatusCode::RANGE_NOT_SATISFIABLE => "RANGE_INVALID",
                StatusCode::INSUFFICIENT_STORAGE => "TOOMANYREQUESTS",
                _ => "UNKNOWN",
            };
            let mut response = (
                error.0,
                Json(json!({"errors":[{"code":code,"message":error.1.trim()}]})),
            )
                .into_response();
            if error.0 == StatusCode::UNAUTHORIZED {
                response.headers_mut().insert(
                    header::WWW_AUTHENTICATE,
                    "Basic realm=\"fluentci-cache\"".parse().unwrap(),
                );
            }
            response
        }
    };
    response.headers_mut().insert(
        "docker-distribution-api-version",
        "registry/2.0".parse().unwrap(),
    );
    response
}

async fn root(State(registry): State<Registry>, request: Request) -> Response {
    let result = (async move {
        if !matches!(*request.method(), Method::GET | Method::HEAD) {
            return Ok(reply(StatusCode::METHOD_NOT_ALLOWED));
        }
        if request.headers().contains_key(header::AUTHORIZATION) {
            let text = request
                .headers()
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let token = if let Some(value) = text.strip_prefix("Bearer ") {
                Some(value.into())
            } else {
                text.strip_prefix("Basic ")
                    .and_then(|v| STANDARD.decode(v).ok())
                    .and_then(|v| String::from_utf8(v).ok())
                    .and_then(|v| v.split_once(':').map(|(_, p)| p.to_owned()))
            };
            let account = token
                .as_deref()
                .and_then(|v| v.split('.').nth(1))
                .and_then(|v| URL_SAFE_NO_PAD.decode(v).ok())
                .and_then(|v| serde_json::from_slice::<Value>(&v).ok())
                .and_then(|v| v["cache"].as_str().map(str::to_owned));
            // The unverified account hint is used only as input to full signature and scope verification.
            upload_authorized(&registry.app, request.headers(), account.as_deref()).await?;
        } else {
            authorized(&registry.app, request.headers(), true)?;
        }
        Ok(Json(json!({})).into_response())
    })
    .await;
    finish(result)
}

async fn handle(
    State(registry): State<Registry>,
    UrlPath(rest): UrlPath<String>,
    request: Request,
) -> Response {
    let result = async {
        let rest = rest.strip_prefix("accounts/").ok_or(Failure(
            StatusCode::BAD_REQUEST,
            "use accounts/<registry-encoded-did>/<repository>\n",
        ))?;
        let (account, rest) = rest
            .split_once('/')
            .ok_or(Failure(StatusCode::BAD_REQUEST, "repository required\n"))?;
        let account = registry.app.aliases.account(account).await?;
        key(&format!("accounts/{account}/generic/check"))?;
        let read = matches!(*request.method(), Method::GET | Method::HEAD);
        if read {
            authorized(&registry.app, request.headers(), true)?;
        } else {
            upload_authorized(&registry.app, request.headers(), Some(&account)).await?;
            if registry.app.config.read_only {
                return Err(Failure(StatusCode::FORBIDDEN, "cache is read-only\n"));
            }
        }
        let permit = if read && super::download::redirects(&registry.app) {
            None
        } else {
            Some(
                registry
                    .app
                    .permits
                    .clone()
                    .try_acquire_owned()
                    .map_err(|_| {
                        Failure(StatusCode::SERVICE_UNAVAILABLE, "cache busy; retry later\n")
                    })?,
            )
        };
        tokio::time::timeout(
            Duration::from_secs(registry.app.config.timeout),
            dispatch(&registry, &account, rest, request, permit),
        )
        .await
        .map_err(|_| Failure(StatusCode::GATEWAY_TIMEOUT, "registry request timed out\n"))?
    }
    .await;
    finish(result)
}

fn repository(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 255
        || value.split('/').any(|part| {
            part.is_empty()
                || part == "."
                || part == ".."
                || !part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b))
        })
    {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "invalid repository name\n",
        ));
    }
    Ok(())
}

async fn dispatch(
    registry: &Registry,
    account: &str,
    rest: &str,
    request: Request,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
) -> Result<Response> {
    if let Some((repo, tail)) = rest.rsplit_once("/blobs/uploads/") {
        repository(repo)?;
        return upload_request(registry, account, repo, tail, request).await;
    }
    if let Some((repo, reference)) = rest.rsplit_once("/manifests/") {
        repository(repo)?;
        return manifest(registry, account, repo, reference, request).await;
    }
    if let Some(repo) = rest.strip_suffix("/tags/list") {
        repository(repo)?;
        return tags(registry, account, repo, request).await;
    }
    if let Some((repo, value)) = rest.rsplit_once("/blobs/") {
        repository(repo)?;
        let hash = digest(value)?;
        if !matches!(*request.method(), Method::GET | Method::HEAD) {
            return Ok(reply(StatusCode::METHOD_NOT_ALLOWED));
        }
        let key = Key {
            path: blob(account, repo, hash),
            account: Some(account.into()),
            cas: None,
            content_type: "application/octet-stream",
            nix_info: false,
        };
        let mut response = download(
            &registry.app,
            key,
            request.headers(),
            *request.method() == Method::HEAD,
            permit,
        )
        .await?;
        set(
            &mut response,
            "docker-content-digest",
            &format!("sha256:{hash}"),
        )?;
        return Ok(response);
    }
    Err(Failure(
        StatusCode::NOT_FOUND,
        "unknown registry endpoint\n",
    ))
}

fn query(request: &Request) -> Result<HashMap<String, String>> {
    let url = reqwest::Url::parse(&format!(
        "http://cache/?{}",
        request.uri().query().unwrap_or("")
    ))
    .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid query\n"))?;
    Ok(url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect())
}

fn session_reply(
    account: &str,
    repo: &str,
    id: &str,
    size: u64,
    status: StatusCode,
) -> Result<Response> {
    let mut response = reply(status);
    set(
        &mut response,
        "location",
        &format!(
            "/v2/accounts/{}/{repo}/blobs/uploads/{id}",
            super::aliases::registry_account(account)
        ),
    )?;
    set(&mut response, "docker-upload-uuid", id)?;
    set(
        &mut response,
        "range",
        &format!("0-{}", size.saturating_sub(1)),
    )?;
    Ok(response)
}

async fn upload_request(
    registry: &Registry,
    account: &str,
    repo: &str,
    id: &str,
    request: Request,
) -> Result<Response> {
    upload_authorized(&registry.app, request.headers(), Some(account)).await?;
    let parameters = query(&request)?;
    let method = request.method().clone();
    if method == Method::POST && id.is_empty() {
        if let (Some(value), Some(source)) = (parameters.get("mount"), parameters.get("from")) {
            let hash = digest(value)?;
            if let Some(source) = source.strip_prefix(&format!(
                "accounts/{}/",
                super::aliases::registry_account(account)
            )) {
                repository(source)?;
                if registry
                    .app
                    .store
                    .head(&blob(account, source, hash))
                    .await
                    .is_ok()
                {
                    registry
                        .app
                        .store
                        .copy(&blob(account, source, hash), &blob(account, repo, hash))
                        .await
                        .map_err(backend_error)?;
                    let mut response = reply(StatusCode::CREATED);
                    set(&mut response, "location", &api_blob(account, repo, hash))?;
                    set(&mut response, "docker-content-digest", value)?;
                    return Ok(response);
                }
            }
        }
        let id = uuid::Uuid::new_v4().to_string();
        let timeout = Duration::from_secs(registry.app.config.timeout);
        let path = registry.app.staging.file().map_err(|_| {
            Failure(
                StatusCode::INSUFFICIENT_STORAGE,
                "temporary storage unavailable\n",
            )
        })?;
        let entry = Arc::new(Mutex::new(Session {
            account: account.into(),
            repository: repo.into(),
            path,
            size: 0,
            updated: Instant::now(),
            allocation: registry.app.staging.allocate(),
        }));
        {
            let mut uploads = registry.uploads.lock().await;
            uploads.retain(|_, entry| {
                entry
                    .try_lock()
                    .map(|s| s.updated.elapsed() < timeout)
                    .unwrap_or(true)
            });
            if uploads.len() >= registry.app.config.concurrency {
                return Err(Failure(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "too many upload sessions\n",
                ));
            }
            uploads.insert(id.clone(), entry.clone());
        }
        let mut session = entry.lock().await;
        if let Err(error) = append(&registry.app, &mut session, request).await {
            drop(session);
            registry.uploads.lock().await.remove(&id);
            return Err(error);
        }
        if let Some(value) = parameters.get("digest") {
            let response = commit(registry, account, repo, value, &session).await;
            drop(session);
            registry.uploads.lock().await.remove(&id);
            return response;
        }
        return session_reply(account, repo, &id, session.size, StatusCode::ACCEPTED);
    }
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(Failure(StatusCode::NOT_FOUND, "upload session not found\n"));
    }
    let entry = registry
        .uploads
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or(Failure(StatusCode::NOT_FOUND, "upload session not found\n"))?;
    let mut session = entry.lock().await;
    if session.account != account
        || session.repository != repo
        || session.updated.elapsed() > Duration::from_secs(registry.app.config.timeout)
    {
        return Err(Failure(StatusCode::NOT_FOUND, "upload session not found\n"));
    }
    match method {
        Method::GET | Method::HEAD => {
            session_reply(account, repo, id, session.size, StatusCode::NO_CONTENT)
        }
        Method::DELETE => {
            drop(session);
            registry.uploads.lock().await.remove(id);
            Ok(reply(StatusCode::NO_CONTENT))
        }
        Method::PATCH => {
            append(&registry.app, &mut session, request).await?;
            session_reply(account, repo, id, session.size, StatusCode::ACCEPTED)
        }
        Method::PUT => {
            let value = parameters
                .get("digest")
                .ok_or(Failure(StatusCode::BAD_REQUEST, "digest required\n"))?;
            digest(value)?;
            append(&registry.app, &mut session, request).await?;
            let response = commit(registry, account, repo, value, &session).await?;
            drop(session);
            registry.uploads.lock().await.remove(id);
            Ok(response)
        }
        _ => Ok(reply(StatusCode::METHOD_NOT_ALLOWED)),
    }
}

async fn append(app: &App, session: &mut Session, request: Request) -> Result<()> {
    let range = request
        .headers()
        .get(header::CONTENT_RANGE)
        .map(|value| {
            let text = value.to_str().map_err(|_| {
                Failure(StatusCode::RANGE_NOT_SATISFIABLE, "invalid upload range\n")
            })?;
            let text = text.strip_prefix("bytes ").unwrap_or(text);
            let (start, end) = text.split_once('-').ok_or(Failure(
                StatusCode::RANGE_NOT_SATISFIABLE,
                "invalid upload range\n",
            ))?;
            let start = start.parse::<u64>().map_err(|_| {
                Failure(StatusCode::RANGE_NOT_SATISFIABLE, "invalid upload offset\n")
            })?;
            let end = end.parse::<u64>().map_err(|_| {
                Failure(StatusCode::RANGE_NOT_SATISFIABLE, "invalid upload offset\n")
            })?;
            if start != session.size || end < start {
                return Err(Failure(
                    StatusCode::RANGE_NOT_SATISFIABLE,
                    "upload offset mismatch\n",
                ));
            }
            Ok(end - start + 1)
        })
        .transpose()?;
    let original = session.size;
    let mut file = tokio::fs::OpenOptions::new()
        .append(true)
        .open(&session.path)
        .await
        .map_err(|_| {
            Failure(
                StatusCode::INSUFFICIENT_STORAGE,
                "temporary storage unavailable\n",
            )
        })?;
    file.set_len(original).await.map_err(|_| {
        Failure(
            StatusCode::INSUFFICIENT_STORAGE,
            "temporary storage unavailable\n",
        )
    })?;
    session.allocation.resize(original)?;
    let mut stream = request.into_body().into_data_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| Failure(StatusCode::BAD_REQUEST, "incomplete upload\n"))?;
        let size = session
            .size
            .checked_add(chunk.len() as u64)
            .filter(|size| *size <= app.config.max_upload)
            .ok_or(Failure(
                StatusCode::PAYLOAD_TOO_LARGE,
                "upload exceeds limit\n",
            ))?;
        session.allocation.resize(size)?;
        file.write_all(&chunk).await.map_err(|_| {
            Failure(
                StatusCode::INSUFFICIENT_STORAGE,
                "temporary storage unavailable\n",
            )
        })?;
        session.size = size;
        session.updated = Instant::now();
    }
    file.flush().await.map_err(|_| {
        Failure(
            StatusCode::INSUFFICIENT_STORAGE,
            "temporary storage unavailable\n",
        )
    })?;
    if range.is_some_and(|expected| session.size - original != expected) {
        return Err(Failure(
            StatusCode::RANGE_NOT_SATISFIABLE,
            "upload range length mismatch\n",
        ));
    }
    Ok(())
}

async fn commit(
    registry: &Registry,
    account: &str,
    repo: &str,
    value: &str,
    session: &Session,
) -> Result<Response> {
    let hash = digest(value)?;
    let file = tokio::fs::File::open(&session.path).await.map_err(|_| {
        Failure(
            StatusCode::INSUFFICIENT_STORAGE,
            "temporary storage unavailable\n",
        )
    })?;
    let key = Key {
        path: blob(account, repo, hash),
        account: Some(account.into()),
        cas: Some(hash.into()),
        content_type: "application/octet-stream",
        nix_info: false,
    };
    upload(
        &registry.app,
        key,
        axum::body::Body::from_stream(ReaderStream::new(file)),
    )
    .await?;
    let mut response = reply(StatusCode::CREATED);
    set(&mut response, "location", &api_blob(account, repo, hash))?;
    set(&mut response, "docker-content-digest", value)?;
    Ok(response)
}

fn reference(value: &str) -> Result<Option<&str>> {
    if value.starts_with("sha256:") {
        return digest(value).map(Some);
    }
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
        || value.starts_with(['.', '-'])
    {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "invalid manifest reference\n",
        ));
    }
    Ok(None)
}

async fn manifest(
    registry: &Registry,
    account: &str,
    repo: &str,
    value: &str,
    request: Request,
) -> Result<Response> {
    let hash = reference(value)?;
    let path = match hash {
        Some(hash) => object(account, repo, "manifests/sha256", hash),
        None => object(account, repo, "manifests/tags", value),
    };
    if matches!(*request.method(), Method::GET | Method::HEAD) {
        let result = registry
            .app
            .reader
            .get(&path)
            .await
            .map_err(backend_error)?;
        if result.meta.size > 4 * 1024 * 1024 {
            return Err(Failure(StatusCode::BAD_GATEWAY, "manifest too large\n"));
        }
        let bytes = result.bytes().await.map_err(backend_error)?;
        let actual = hex::encode(Sha256::digest(&bytes));
        if hash.is_some_and(|expected| expected != actual) {
            return Err(Failure(
                StatusCode::BAD_GATEWAY,
                "manifest integrity mismatch\n",
            ));
        }
        let hash = actual;
        let metadata = registry
            .app
            .reader
            .get(&object(account, repo, "manifest-types", &hash))
            .await
            .map_err(backend_error)?;
        if metadata.meta.size > 256 {
            return Err(Failure(
                StatusCode::BAD_GATEWAY,
                "invalid manifest media type\n",
            ));
        }
        let media = String::from_utf8(metadata.bytes().await.map_err(backend_error)?.to_vec())
            .map_err(|_| Failure(StatusCode::BAD_GATEWAY, "invalid manifest media type\n"))?;
        let mut response = if *request.method() == Method::HEAD {
            axum::body::Body::empty()
        } else {
            axum::body::Body::from(bytes.clone())
        }
        .into_response();
        set(&mut response, "content-type", &media)?;
        set(&mut response, "content-length", &bytes.len().to_string())?;
        set(
            &mut response,
            "docker-content-digest",
            &format!("sha256:{hash}"),
        )?;
        set(&mut response, "etag", &format!("\"sha256:{hash}\""))?;
        return Ok(response);
    }
    if *request.method() != Method::PUT {
        return Ok(reply(StatusCode::METHOD_NOT_ALLOWED));
    }
    let media = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .map(str::to_owned);
    let bytes = to_bytes(
        request.into_body(),
        registry.app.config.max_upload.min(4 * 1024 * 1024) as usize,
    )
    .await
    .map_err(|_| Failure(StatusCode::PAYLOAD_TOO_LARGE, "manifest exceeds limit\n"))?;
    let document: Value = serde_json::from_slice(&bytes)
        .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid manifest JSON\n"))?;
    if document["schemaVersion"] != 2 {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "schemaVersion 2 required\n",
        ));
    }
    let media = media
        .filter(|m| m != "application/octet-stream")
        .or_else(|| document["mediaType"].as_str().map(str::to_owned))
        .ok_or(Failure(
            StatusCode::BAD_REQUEST,
            "manifest media type required\n",
        ))?;
    let index = matches!(
        media.as_str(),
        "application/vnd.oci.image.index.v1+json"
            | "application/vnd.docker.distribution.manifest.list.v2+json"
    );
    if !index
        && !matches!(
            media.as_str(),
            "application/vnd.oci.image.manifest.v1+json"
                | "application/vnd.docker.distribution.manifest.v2+json"
        )
    {
        return Err(Failure(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "unsupported manifest media type\n",
        ));
    }
    let descriptors = if index {
        document["manifests"]
            .as_array()
            .ok_or(Failure(
                StatusCode::BAD_REQUEST,
                "manifest descriptors required\n",
            ))?
            .iter()
            .collect::<Vec<_>>()
    } else {
        let mut descriptors = vec![&document["config"]];
        descriptors.extend(
            document["layers"]
                .as_array()
                .ok_or(Failure(StatusCode::BAD_REQUEST, "layers required\n"))?,
        );
        descriptors
    };
    for descriptor in descriptors {
        let digest_text = descriptor["digest"].as_str().ok_or(Failure(
            StatusCode::BAD_REQUEST,
            "descriptor digest required\n",
        ))?;
        let hash = digest(digest_text)?;
        let path = if index {
            object(account, repo, "manifests/sha256", hash)
        } else {
            blob(account, repo, hash)
        };
        let metadata = match registry.app.store.head(&path).await {
            Ok(metadata) => metadata,
            Err(object_store::Error::NotFound { .. }) if index => registry
                .app
                .store
                .head(&blob(account, repo, hash))
                .await
                .map_err(backend_error)?,
            Err(error) => return Err(backend_error(error)),
        };
        if descriptor["size"].as_u64() != Some(metadata.size) {
            return Err(Failure(
                StatusCode::BAD_REQUEST,
                "descriptor size mismatch\n",
            ));
        }
    }
    let actual = hex::encode(Sha256::digest(&bytes));
    if hash.is_some_and(|hash| hash != actual) {
        return Err(Failure(
            StatusCode::BAD_REQUEST,
            "manifest digest mismatch\n",
        ));
    }
    registry
        .app
        .store
        .put(
            &object(account, repo, "manifest-types", &actual),
            bytes::Bytes::from(media).into(),
        )
        .await
        .map_err(backend_error)?;
    registry
        .app
        .store
        .put(
            &object(account, repo, "manifests/sha256", &actual),
            bytes.clone().into(),
        )
        .await
        .map_err(backend_error)?;
    if hash.is_none() {
        registry
            .app
            .store
            .put(&path, bytes.into())
            .await
            .map_err(backend_error)?;
    }
    let mut response = reply(StatusCode::CREATED);
    set(
        &mut response,
        "location",
        &format!(
            "/v2/accounts/{}/{repo}/manifests/sha256:{actual}",
            super::aliases::registry_account(account)
        ),
    )?;
    set(
        &mut response,
        "docker-content-digest",
        &format!("sha256:{actual}"),
    )?;
    Ok(response)
}

async fn tags(
    registry: &Registry,
    account: &str,
    repo: &str,
    request: Request,
) -> Result<Response> {
    if *request.method() != Method::GET {
        return Ok(reply(StatusCode::METHOD_NOT_ALLOWED));
    }
    upload_authorized(&registry.app, request.headers(), Some(account)).await?;
    let parameters = query(&request)?;
    let limit = parameters
        .get("n")
        .map(|s| s.parse::<usize>())
        .transpose()
        .map_err(|_| Failure(StatusCode::BAD_REQUEST, "invalid tag limit\n"))?
        .unwrap_or(100)
        .clamp(1, 1000);
    let after = parameters.get("last").map(String::as_str).unwrap_or("");
    let prefix = object(account, repo, "manifests", "tags");
    let base = format!("{}/", prefix);
    let mut names = BTreeSet::new();
    let mut source = registry.app.store.list(Some(&prefix));
    while let Some(metadata) = source.next().await {
        let metadata = metadata.map_err(backend_error)?;
        if let Some(name) = metadata.location.as_ref().strip_prefix(&base)
            && name > after
            && !name.contains('/')
        {
            names.insert(name.to_owned());
            if names.len() > limit + 1 {
                names.pop_last();
            }
        }
    }
    let more = names.len() > limit;
    if more {
        names.pop_last();
    }
    let last = names.last().cloned();
    let mut response=Json(json!({"name":format!("accounts/{}/{repo}", super::aliases::registry_account(account)),"tags":names.into_iter().collect::<Vec<_>>()})).into_response();
    if more && let Some(last) = last {
        set(
            &mut response,
            "link",
            &format!(
                "</v2/accounts/{}/{repo}/tags/list?n={limit}&last={last}>; rel=\"next\"",
                super::aliases::registry_account(account)
            ),
        )?;
    }
    Ok(response)
}
