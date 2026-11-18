//! Bazel Remote Execution API cache services (no remote execution).
use super::{
    App,
    auth::{authorized, upload_authorized},
    error::Failure,
    key::{Key, key},
    upload::upload,
};
use crate::proto::{
    build::bazel::{remote::execution::v2 as re, semver::SemVer},
    google::{bytestream as bs, rpc},
};
use axum::{
    body::Body,
    http::{HeaderMap, StatusCode},
};
use bytes::Bytes;
use futures_util::{
    StreamExt, TryStreamExt,
    stream::{self, BoxStream},
};
use object_store::{GetOptions, GetRange, path::Path};
use prost::Message;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    io::AsyncWriteExt,
    sync::{Mutex, OwnedSemaphorePermit},
};
use tokio_util::io::ReaderStream;
use tonic::{Request, Response, Status, Streaming};

const BATCH_LIMIT: usize = 3 * 1024 * 1024;

#[derive(Clone)]
struct Cache {
    app: Arc<App>,
    uploads: Arc<Mutex<HashMap<String, Arc<Mutex<Pending>>>>>,
}

struct Pending {
    allocation: super::staging::Allocation,
    file: tempfile::TempPath,
    size: u64,
    updated: Instant,
}

pub(super) fn router(app: Arc<App>) -> axum::Router {
    let timeout = Duration::from_secs(app.config.timeout);
    let cache = Cache {
        app,
        uploads: Arc::default(),
    };
    tonic::service::Routes::new(
        re::action_cache_server::ActionCacheServer::new(cache.clone())
            .max_decoding_message_size(8 * 1024 * 1024)
            .max_encoding_message_size(8 * 1024 * 1024),
    )
    .add_service(
        re::content_addressable_storage_server::ContentAddressableStorageServer::new(cache.clone())
            .max_decoding_message_size(8 * 1024 * 1024)
            .max_encoding_message_size(8 * 1024 * 1024),
    )
    .add_service(re::capabilities_server::CapabilitiesServer::new(
        cache.clone(),
    ))
    .add_service(
        bs::byte_stream_server::ByteStreamServer::new(cache)
            .max_decoding_message_size(8 * 1024 * 1024),
    )
    .into_axum_router()
    .layer(axum::middleware::from_fn_with_state(timeout, deadline))
}

async fn deadline(
    axum::extract::State(timeout): axum::extract::State<Duration>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    match tokio::time::timeout(timeout, next.run(request)).await {
        Ok(response) => response,
        Err(_) => {
            Status::deadline_exceeded("cache request timed out").into_http::<axum::body::Body>()
        }
    }
}

fn failure(value: Failure) -> Status {
    match value.0 {
        StatusCode::UNAUTHORIZED => Status::unauthenticated(value.1),
        StatusCode::FORBIDDEN => Status::permission_denied(value.1),
        StatusCode::BAD_REQUEST => Status::invalid_argument(value.1),
        StatusCode::NOT_FOUND => Status::not_found(value.1),
        StatusCode::PAYLOAD_TOO_LARGE | StatusCode::INSUFFICIENT_STORAGE => {
            Status::resource_exhausted(value.1)
        }
        _ => Status::unavailable("cache backend unavailable"),
    }
}

fn backend(error: object_store::Error) -> Status {
    failure(super::error::backend_error(error))
}

fn digest(value: Option<&re::Digest>, max: u64) -> Result<&re::Digest, Status> {
    let value = value.ok_or_else(|| Status::invalid_argument("digest required"))?;
    if value.size_bytes < 0
        || value.size_bytes as u64 > max
        || value.hash.len() != 64
        || !value
            .hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Status::invalid_argument(
            "expected lowercase SHA-256 digest and supported size",
        ));
    }
    Ok(value)
}

fn empty(value: &re::Digest) -> bool {
    value.size_bytes == 0
        && value.hash == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}

fn cas_path(account: &str, value: &re::Digest) -> Path {
    Path::parse(format!("accounts/{account}/bazel/cas/{}", value.hash))
        .expect("validated cache storage path")
}

fn digest_function(function: i32) -> Result<(), Status> {
    if function != 0 && function != re::digest_function::Value::Sha256 as i32 {
        return Err(Status::invalid_argument("only SHA-256 is supported"));
    }
    Ok(())
}

impl Cache {
    async fn authorize(
        &self,
        headers: &HeaderMap,
        instance: &str,
        write: bool,
    ) -> Result<String, Status> {
        let account = instance
            .strip_prefix("accounts/")
            .and_then(|s| s.strip_suffix("/bazel").or(Some(s)))
            .ok_or_else(|| {
                Status::invalid_argument("set remote_instance_name to accounts/<owner-did>")
            })?;
        let account = self.app.aliases.account(account).await.map_err(failure)?;
        key(&format!("accounts/{account}/generic/check")).map_err(failure)?;
        if write {
            upload_authorized(&self.app, headers, Some(&account))
                .await
                .map_err(failure)?;
            if self.app.config.read_only {
                return Err(Status::permission_denied("cache is read-only"));
            }
        } else {
            authorized(&self.app, headers, true).map_err(failure)?;
        }
        Ok(account)
    }

    async fn account<T: Sync>(
        &self,
        request: &Request<T>,
        instance: &str,
        write: bool,
    ) -> Result<String, Status> {
        self.authorize(&request.metadata().clone().into_headers(), instance, write)
            .await
    }

    fn permit(&self) -> Result<OwnedSemaphorePermit, Status> {
        self.app
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("cache busy; retry later"))
    }

    async fn cas_bytes(
        &self,
        account: &str,
        value: &re::Digest,
        limit: usize,
    ) -> Result<Vec<u8>, Status> {
        if value.size_bytes as u64 > limit as u64 {
            return Err(Status::resource_exhausted("use ByteStream for large blobs"));
        }
        if empty(value) {
            return Ok(Vec::new());
        }
        let result = self
            .app
            .reader
            .get(&cas_path(account, value))
            .await
            .map_err(backend)?;
        if result.meta.size != value.size_bytes as u64 {
            return Err(Status::data_loss("stored blob size differs from digest"));
        }
        Ok(result.bytes().await.map_err(backend)?.to_vec())
    }

    async fn put_cas(
        &self,
        account: &str,
        value: &re::Digest,
        data: Vec<u8>,
    ) -> Result<(), Status> {
        if data.len() as i64 != value.size_bytes {
            return Err(Status::invalid_argument("digest size mismatch"));
        }
        let key = Key {
            path: cas_path(account, value),
            account: Some(account.into()),
            cas: Some(value.hash.clone()),
            content_type: "application/octet-stream",
            nix_info: false,
        };
        upload(&self.app, key, Body::from(data))
            .await
            .map_err(failure)?;
        Ok(())
    }
}

#[tonic::async_trait]
impl re::capabilities_server::Capabilities for Cache {
    async fn get_capabilities(
        &self,
        request: Request<re::GetCapabilitiesRequest>,
    ) -> Result<Response<re::ServerCapabilities>, Status> {
        if request.get_ref().instance_name.is_empty() {
            authorized(&self.app, &request.metadata().clone().into_headers(), true)
                .map_err(failure)?;
        } else {
            self.account(&request, &request.get_ref().instance_name, false)
                .await?;
        }
        Ok(Response::new(re::ServerCapabilities {
            cache_capabilities: Some(re::CacheCapabilities {
                digest_functions: vec![re::digest_function::Value::Sha256 as i32],
                action_cache_update_capabilities: Some(re::ActionCacheUpdateCapabilities {
                    update_enabled: !self.app.config.read_only,
                }),
                max_batch_total_size_bytes: BATCH_LIMIT as i64,
                max_cas_blob_size_bytes: self.app.config.max_upload as i64,
                ..Default::default()
            }),
            low_api_version: Some(SemVer {
                major: 2,
                minor: 0,
                ..Default::default()
            }),
            high_api_version: Some(SemVer {
                major: 2,
                minor: 4,
                ..Default::default()
            }),
            ..Default::default()
        }))
    }
}

#[tonic::async_trait]
impl re::action_cache_server::ActionCache for Cache {
    async fn get_action_result(
        &self,
        request: Request<re::GetActionResultRequest>,
    ) -> Result<Response<re::ActionResult>, Status> {
        let account = self
            .account(&request, &request.get_ref().instance_name, false)
            .await?;
        let input = request.into_inner();
        digest_function(input.digest_function)?;
        let value = digest(input.action_digest.as_ref(), self.app.config.max_upload)?;
        let _permit = self.permit()?;
        let result = self
            .app
            .reader
            .get(
                &Path::parse(format!("accounts/{account}/bazel/ac/{}", value.hash))
                    .expect("validated cache storage path"),
            )
            .await
            .map_err(backend)?;
        if result.meta.size > BATCH_LIMIT as u64 {
            return Err(Status::resource_exhausted("action result too large"));
        }
        let mut result = re::ActionResult::decode(result.bytes().await.map_err(backend)?)
            .map_err(|_| Status::data_loss("invalid action result"))?;
        // A stale AC entry is a miss when required output files or directory trees were evicted.
        for value in result
            .output_files
            .iter()
            .filter_map(|f| f.digest.as_ref())
            .chain(
                result
                    .output_directories
                    .iter()
                    .filter_map(|d| d.tree_digest.as_ref()),
            )
            .chain(result.stdout_digest.iter())
            .chain(result.stderr_digest.iter())
        {
            digest(Some(value), self.app.config.max_upload)?;
            if !empty(value) {
                self.app
                    .reader
                    .head(&cas_path(&account, value))
                    .await
                    .map_err(backend)?;
            }
        }
        if input.inline_stdout
            && let Some(value) = &result.stdout_digest
            && value.size_bytes <= 1024 * 1024
        {
            result.stdout_raw = self.cas_bytes(&account, value, 1024 * 1024).await?;
        }
        if input.inline_stderr
            && let Some(value) = &result.stderr_digest
            && value.size_bytes <= 1024 * 1024
        {
            result.stderr_raw = self.cas_bytes(&account, value, 1024 * 1024).await?;
        }
        Ok(Response::new(result))
    }

    async fn update_action_result(
        &self,
        request: Request<re::UpdateActionResultRequest>,
    ) -> Result<Response<re::ActionResult>, Status> {
        let account = self
            .account(&request, &request.get_ref().instance_name, true)
            .await?;
        let input = request.into_inner();
        digest_function(input.digest_function)?;
        let value = digest(input.action_digest.as_ref(), self.app.config.max_upload)?;
        let result = input
            .action_result
            .ok_or_else(|| Status::invalid_argument("action result required"))?;
        let bytes = result.encode_to_vec();
        if bytes.len() > BATCH_LIMIT {
            return Err(Status::resource_exhausted("action result too large"));
        }
        let _permit = self.permit()?;
        self.app
            .store
            .put(
                &Path::parse(format!("accounts/{account}/bazel/ac/{}", value.hash))
                    .expect("validated cache storage path"),
                Bytes::from(bytes).into(),
            )
            .await
            .map_err(backend)?;
        Ok(Response::new(result))
    }
}

#[tonic::async_trait]
impl re::content_addressable_storage_server::ContentAddressableStorage for Cache {
    async fn find_missing_blobs(
        &self,
        request: Request<re::FindMissingBlobsRequest>,
    ) -> Result<Response<re::FindMissingBlobsResponse>, Status> {
        let account = self
            .account(&request, &request.get_ref().instance_name, false)
            .await?;
        let input = request.into_inner();
        digest_function(input.digest_function)?;
        if input.blob_digests.len() > 10000 {
            return Err(Status::resource_exhausted("too many digests"));
        }
        let _permit = self.permit()?;
        let mut missing = Vec::new();
        for value in input.blob_digests {
            digest(Some(&value), self.app.config.max_upload)?;
            if empty(&value) {
                continue;
            }
            match self.app.reader.head(&cas_path(&account, &value)).await {
                Ok(meta) if meta.size == value.size_bytes as u64 => {}
                Ok(_) => missing.push(value),
                Err(object_store::Error::NotFound { .. }) => missing.push(value),
                Err(error) => return Err(backend(error)),
            }
        }
        Ok(Response::new(re::FindMissingBlobsResponse {
            missing_blob_digests: missing,
        }))
    }

    async fn batch_update_blobs(
        &self,
        request: Request<re::BatchUpdateBlobsRequest>,
    ) -> Result<Response<re::BatchUpdateBlobsResponse>, Status> {
        let account = self
            .account(&request, &request.get_ref().instance_name, true)
            .await?;
        let input = request.into_inner();
        digest_function(input.digest_function)?;
        if input.requests.iter().map(|r| r.data.len()).sum::<usize>() > BATCH_LIMIT
            || input.requests.len() > 10000
        {
            return Err(Status::resource_exhausted("batch too large"));
        }
        let _permit = self.permit()?;
        let mut responses = Vec::new();
        for item in input.requests {
            let result = async {
                if item.compressor != 0 {
                    return Err(Status::unimplemented("compressed blobs are not supported"));
                }
                let value = digest(item.digest.as_ref(), self.app.config.max_upload)?;
                self.put_cas(&account, value, item.data).await
            }
            .await;
            responses.push(re::batch_update_blobs_response::Response {
                digest: item.digest,
                status: Some(rpc_status(result.err())),
            });
        }
        Ok(Response::new(re::BatchUpdateBlobsResponse { responses }))
    }

    async fn batch_read_blobs(
        &self,
        request: Request<re::BatchReadBlobsRequest>,
    ) -> Result<Response<re::BatchReadBlobsResponse>, Status> {
        let account = self
            .account(&request, &request.get_ref().instance_name, false)
            .await?;
        let input = request.into_inner();
        digest_function(input.digest_function)?;
        if input.digests.len() > 10000 {
            return Err(Status::resource_exhausted("too many digests"));
        }
        let mut total = 0_u64;
        for value in &input.digests {
            total = total
                .checked_add(digest(Some(value), self.app.config.max_upload)?.size_bytes as u64)
                .ok_or_else(|| Status::resource_exhausted("batch too large"))?;
        }
        if total > BATCH_LIMIT as u64 {
            return Err(Status::resource_exhausted("batch too large"));
        }
        let _permit = self.permit()?;
        let mut responses = Vec::new();
        for value in input.digests {
            let result = self.cas_bytes(&account, &value, BATCH_LIMIT).await;
            let (data, error) = match result {
                Ok(data) => (data, None),
                Err(error) => (Vec::new(), Some(error)),
            };
            responses.push(re::batch_read_blobs_response::Response {
                digest: Some(value),
                data,
                compressor: 0,
                status: Some(rpc_status(error)),
            });
        }
        Ok(Response::new(re::BatchReadBlobsResponse { responses }))
    }

    type GetTreeStream = BoxStream<'static, Result<re::GetTreeResponse, Status>>;
    async fn get_tree(
        &self,
        request: Request<re::GetTreeRequest>,
    ) -> Result<Response<Self::GetTreeStream>, Status> {
        let account = self
            .account(&request, &request.get_ref().instance_name, false)
            .await?;
        let input = request.into_inner();
        digest_function(input.digest_function)?;
        if !input.page_token.is_empty() {
            return Err(Status::invalid_argument(
                "page tokens are not supported; consume the full stream",
            ));
        }
        let root = digest(input.root_digest.as_ref(), self.app.config.max_upload)?.clone();
        let cache = self.clone();
        let permit = self.permit()?;
        let output = stream::try_unfold(
            (VecDeque::from([root]), HashSet::new(), permit),
            move |(mut pending, mut seen, permit)| {
                let cache = cache.clone();
                let account = account.clone();
                async move {
                    while let Some(value) = pending.pop_front() {
                        if !seen.insert(value.hash.clone()) {
                            continue;
                        }
                        if seen.len() > 100000 {
                            return Err(Status::resource_exhausted("directory tree too large"));
                        }
                        let bytes = cache.cas_bytes(&account, &value, BATCH_LIMIT).await?;
                        let directory = re::Directory::decode(bytes.as_slice())
                            .map_err(|_| Status::data_loss("invalid directory"))?;
                        for child in &directory.directories {
                            pending.push_back(
                                digest(child.digest.as_ref(), cache.app.config.max_upload)?.clone(),
                            );
                        }
                        return Ok(Some((
                            re::GetTreeResponse {
                                directories: vec![directory],
                                next_page_token: String::new(),
                            },
                            (pending, seen, permit),
                        )));
                    }
                    Ok(None)
                }
            },
        )
        .boxed();
        Ok(Response::new(output))
    }

    async fn split_blob(
        &self,
        _: Request<re::SplitBlobRequest>,
    ) -> Result<Response<re::SplitBlobResponse>, Status> {
        Err(Status::unimplemented("chunking is not advertised"))
    }
    type GetChunkMappingStream = BoxStream<'static, Result<re::GetChunkMappingResponse, Status>>;

    async fn get_chunk_mapping(
        &self,
        _: Request<re::GetChunkMappingRequest>,
    ) -> Result<Response<Self::GetChunkMappingStream>, Status> {
        Err(Status::unimplemented("chunking is not advertised"))
    }
    async fn splice_blob(
        &self,
        _: Request<re::SpliceBlobRequest>,
    ) -> Result<Response<re::SpliceBlobResponse>, Status> {
        Err(Status::unimplemented("chunking is not advertised"))
    }
    async fn register_chunk_mapping(
        &self,
        _: Request<Streaming<re::RegisterChunkMappingRequest>>,
    ) -> Result<Response<re::RegisterChunkMappingResponse>, Status> {
        Err(Status::unimplemented("chunking is not advertised"))
    }
}

fn rpc_status(error: Option<Status>) -> rpc::Status {
    match error {
        Some(error) => rpc::Status {
            code: error.code() as i32,
            message: error.message().into(),
            details: Vec::new(),
        },
        None => rpc::Status::default(),
    }
}

fn resource(name: &str, write: bool, max: u64) -> Result<(String, re::Digest), Status> {
    if name.len() > 2048 {
        return Err(Status::invalid_argument("resource name too long"));
    }
    let (instance, blob) = name
        .rsplit_once("/blobs/")
        .ok_or_else(|| Status::invalid_argument("expected instance/blobs/hash/size"))?;
    let instance = if write {
        let (instance, id) = instance
            .rsplit_once("/uploads/")
            .ok_or_else(|| Status::invalid_argument("upload resource name required"))?;
        if id.is_empty()
            || id.len() > 128
            || !id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(Status::invalid_argument("invalid upload id"));
        }
        instance
    } else {
        instance
    };
    let (hash, size) = blob
        .split_once('/')
        .ok_or_else(|| Status::invalid_argument("digest and size required"))?;
    let value = re::Digest {
        hash: hash.into(),
        size_bytes: size
            .parse()
            .map_err(|_| Status::invalid_argument("invalid blob size"))?,
    };
    digest(Some(&value), max)?;
    Ok((instance.into(), value))
}

#[tonic::async_trait]
impl bs::byte_stream_server::ByteStream for Cache {
    type ReadStream = BoxStream<'static, Result<bs::ReadResponse, Status>>;
    async fn read(
        &self,
        request: Request<bs::ReadRequest>,
    ) -> Result<Response<Self::ReadStream>, Status> {
        let (instance, value) = resource(
            &request.get_ref().resource_name,
            false,
            self.app.config.max_upload,
        )?;
        let account = self.account(&request, &instance, false).await?;
        let input = request.into_inner();
        if input.read_offset < 0 || input.read_limit < 0 || input.read_offset > value.size_bytes {
            return Err(Status::out_of_range("invalid read range"));
        }
        let permit = self.permit()?;
        if empty(&value) || input.read_offset == value.size_bytes {
            return Ok(Response::new(stream::empty().boxed()));
        }
        let end = if input.read_limit == 0 {
            value.size_bytes
        } else {
            input
                .read_offset
                .saturating_add(input.read_limit)
                .min(value.size_bytes)
        };
        let result = self
            .app
            .reader
            .get_opts(
                &cas_path(&account, &value),
                GetOptions {
                    range: Some(GetRange::Bounded(input.read_offset as u64..end as u64)),
                    ..Default::default()
                },
            )
            .await
            .map_err(backend)?;
        if result.meta.size != value.size_bytes as u64 {
            return Err(Status::data_loss("blob size mismatch"));
        }
        let timeout = Duration::from_secs(self.app.config.timeout);
        let output = stream::try_unfold(
            (result.into_stream(), permit, Bytes::new()),
            move |(mut source, permit, mut pending)| async move {
                while pending.is_empty() {
                    let item = tokio::time::timeout(timeout, source.try_next())
                        .await
                        .map_err(|_| Status::deadline_exceeded("download stalled"))?
                        .map_err(backend)?;
                    match item {
                        Some(bytes) => pending = bytes,
                        None => return Ok(None),
                    }
                }
                let chunk = pending.split_to(pending.len().min(64 * 1024));
                Ok(Some((
                    bs::ReadResponse {
                        data: chunk.to_vec(),
                    },
                    (source, permit, pending),
                )))
            },
        )
        .boxed();
        Ok(Response::new(output))
    }

    async fn write(
        &self,
        request: Request<Streaming<bs::WriteRequest>>,
    ) -> Result<Response<bs::WriteResponse>, Status> {
        let headers = request.metadata().clone().into_headers();
        let mut input = request.into_inner();
        let timeout = Duration::from_secs(self.app.config.timeout);
        let _permit = self.permit()?;
        let first = tokio::time::timeout(timeout, input.message())
            .await
            .map_err(|_| Status::deadline_exceeded("upload timed out"))??
            .ok_or_else(|| Status::invalid_argument("empty write stream"))?;
        let name = first.resource_name.clone();
        let (instance, value) = resource(&name, true, self.app.config.max_upload)?;
        let account = self.authorize(&headers, &instance, true).await?;
        let entry = {
            let mut uploads = self.uploads.lock().await;
            uploads.retain(|_, entry| {
                entry
                    .try_lock()
                    .map(|e| e.updated.elapsed() < timeout)
                    .unwrap_or(true)
            });
            if let Some(entry) = uploads.get(&name) {
                entry.clone()
            } else {
                if uploads.len() >= self.app.config.concurrency {
                    return Err(Status::resource_exhausted("too many upload sessions"));
                }
                let file = self
                    .app
                    .staging
                    .file()
                    .map_err(|_| Status::internal("temporary storage unavailable"))?;
                let entry = Arc::new(Mutex::new(Pending {
                    allocation: self.app.staging.allocate(),
                    file,
                    size: 0,
                    updated: Instant::now(),
                }));
                uploads.insert(name.clone(), entry.clone());
                entry
            }
        };
        let mut entry = entry.lock().await;
        tokio::time::timeout(timeout, async {
            let mut item = Some(first);
            let mut finished = false;
            let mut file = tokio::fs::OpenOptions::new()
                .append(true)
                .open(&entry.file)
                .await
                .map_err(|_| Status::internal("temporary storage unavailable"))?;
            let original_size = entry.size;
            file.set_len(original_size)
                .await
                .map_err(|_| Status::internal("temporary storage unavailable"))?;
            entry.allocation.resize(original_size).map_err(failure)?;
            while let Some(message) = item.take() {
                if finished {
                    return Err(Status::invalid_argument("messages after finish_write"));
                }
                if (!message.resource_name.is_empty() && message.resource_name != name)
                    || message.write_offset < 0
                    || message.write_offset as u64 != entry.size
                {
                    return Err(Status::out_of_range("upload offset or resource changed"));
                }
                let size = entry
                    .size
                    .checked_add(message.data.len() as u64)
                    .filter(|size| *size <= value.size_bytes as u64)
                    .ok_or_else(|| Status::invalid_argument("upload exceeds digest size"))?;
                entry.allocation.resize(size).map_err(failure)?;
                file.write_all(&message.data)
                    .await
                    .map_err(|_| Status::internal("temporary storage unavailable"))?;
                entry.size = size;
                entry.updated = Instant::now();
                finished = message.finish_write;
                item = input.message().await?;
            }
            file.flush()
                .await
                .map_err(|_| Status::internal("temporary storage unavailable"))?;
            drop(file);
            if !finished {
                return Err(Status::invalid_argument(
                    "finish_write was not received; upload may be resumed",
                ));
            }
            if entry.size != value.size_bytes as u64 {
                return Err(Status::invalid_argument("incomplete blob"));
            }
            let file = tokio::fs::File::open(&entry.file)
                .await
                .map_err(|_| Status::internal("temporary storage unavailable"))?;
            let key = Key {
                path: cas_path(&account, &value),
                account: Some(account.clone()),
                cas: Some(value.hash.clone()),
                content_type: "application/octet-stream",
                nix_info: false,
            };
            upload(&self.app, key, Body::from_stream(ReaderStream::new(file)))
                .await
                .map_err(failure)?;
            Ok(())
        })
        .await
        .map_err(|_| Status::deadline_exceeded("upload timed out"))??;
        drop(entry);
        self.uploads.lock().await.remove(&name);
        Ok(Response::new(bs::WriteResponse {
            committed_size: value.size_bytes,
        }))
    }

    async fn query_write_status(
        &self,
        request: Request<bs::QueryWriteStatusRequest>,
    ) -> Result<Response<bs::QueryWriteStatusResponse>, Status> {
        let (instance, value) = resource(
            &request.get_ref().resource_name,
            true,
            self.app.config.max_upload,
        )?;
        let account = self.account(&request, &instance, true).await?;
        let entry = self
            .uploads
            .lock()
            .await
            .get(&request.get_ref().resource_name)
            .cloned();
        if let Some(entry) = entry {
            let entry = entry.lock().await;
            return Ok(Response::new(bs::QueryWriteStatusResponse {
                committed_size: entry.size as i64,
                complete: false,
            }));
        }
        if empty(&value)
            || self
                .app
                .store
                .head(&cas_path(&account, &value))
                .await
                .is_ok_and(|meta| meta.size == value.size_bytes as u64)
        {
            return Ok(Response::new(bs::QueryWriteStatusResponse {
                committed_size: value.size_bytes,
                complete: true,
            }));
        }
        Err(Status::not_found("upload session not found"))
    }
}
