use clap::Parser;
use fluentci_cache::{
    Config,
    proto::{build::bazel::remote::execution::v2 as re, google::bytestream as bs},
    router,
};
use object_store::{ObjectStore, memory::InMemory, path::Path};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tonic::{Code, Request};

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

struct Fixture {
    url: String,
    token: String,
    account: String,
    store: Arc<InMemory>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn fixture() -> Fixture {
    let data: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/upload-tokens.json")).unwrap();
    let folder = tempfile::tempdir().unwrap();
    let path = folder.path().join("public.pem");
    std::fs::write(&path, data["publicKey"].as_str().unwrap()).unwrap();
    let mut config =
        Options::parse_from(["test", "--backend", "memory", "--token", "admin"]).config;
    config.upload_token_public_key_file = Some(path);
    let store = Arc::new(InMemory::new());
    let app = router(config, store.clone()).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    Fixture {
        url,
        token: data["valid"].as_str().unwrap().into(),
        account: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
        store,
        task,
    }
}

fn auth<T>(body: T, token: &str) -> Request<T> {
    let mut request = Request::new(body);
    request
        .metadata_mut()
        .insert("authorization", format!("Bearer {token}").parse().unwrap());
    request
}

fn digest(data: &[u8]) -> re::Digest {
    re::Digest {
        hash: hex::encode(Sha256::digest(data)),
        size_bytes: data.len() as i64,
    }
}

#[tokio::test]
async fn grpc_cas_action_cache_and_account_auth_interoperate() {
    let f = fixture().await;
    let instance = format!("accounts/{}", f.account);
    let mut caps = re::capabilities_client::CapabilitiesClient::connect(f.url.clone())
        .await
        .unwrap();
    let caps = caps
        .get_capabilities(re::GetCapabilitiesRequest {
            instance_name: instance.clone(),
        })
        .await
        .unwrap()
        .into_inner();
    assert!(caps.execution_capabilities.is_none());
    assert_eq!(
        caps.cache_capabilities.unwrap().digest_functions,
        vec![re::digest_function::Value::Sha256 as i32]
    );
    let mut cas = re::content_addressable_storage_client::ContentAddressableStorageClient::connect(
        f.url.clone(),
    )
    .await
    .unwrap();
    let data = b"artifact";
    let value = digest(data);
    let wrong = re::Digest {
        hash: "b".repeat(64),
        size_bytes: 1,
    };
    let result = cas
        .batch_update_blobs(auth(
            re::BatchUpdateBlobsRequest {
                instance_name: instance.clone(),
                requests: vec![
                    re::batch_update_blobs_request::Request {
                        digest: Some(value.clone()),
                        data: data.to_vec(),
                        compressor: 0,
                    },
                    re::batch_update_blobs_request::Request {
                        digest: Some(wrong.clone()),
                        data: b"x".to_vec(),
                        compressor: 0,
                    },
                ],
                ..Default::default()
            },
            &f.token,
        ))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.responses[0].status.as_ref().unwrap().code, 0);
    assert_eq!(
        result.responses[1].status.as_ref().unwrap().code,
        Code::InvalidArgument as i32
    );
    let found = cas
        .find_missing_blobs(re::FindMissingBlobsRequest {
            instance_name: instance.clone(),
            blob_digests: vec![value.clone(), wrong.clone(), digest(b"")],
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(found.missing_blob_digests, vec![wrong.clone()]);
    let read = cas
        .batch_read_blobs(re::BatchReadBlobsRequest {
            instance_name: instance.clone(),
            digests: vec![value.clone(), wrong],
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(read.responses[0].data, data);
    assert_eq!(
        read.responses[1].status.as_ref().unwrap().code,
        Code::NotFound as i32
    );
    let mut ac = re::action_cache_client::ActionCacheClient::connect(f.url.clone())
        .await
        .unwrap();
    let action = digest(b"action");
    let result = re::ActionResult {
        output_files: vec![re::OutputFile {
            path: "bin/result".into(),
            digest: Some(value.clone()),
            ..Default::default()
        }],
        ..Default::default()
    };
    ac.update_action_result(auth(
        re::UpdateActionResultRequest {
            instance_name: instance.clone(),
            action_digest: Some(action.clone()),
            action_result: Some(result.clone()),
            ..Default::default()
        },
        &f.token,
    ))
    .await
    .unwrap();
    let read = ac
        .get_action_result(re::GetActionResultRequest {
            instance_name: instance.clone(),
            action_digest: Some(action.clone()),
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(read, result);
    let denied = ac
        .update_action_result(auth(
            re::UpdateActionResultRequest {
                instance_name: format!("accounts/{}", "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb"),
                action_digest: Some(action.clone()),
                action_result: Some(result),
                ..Default::default()
            },
            &f.token,
        ))
        .await
        .unwrap_err();
    assert_eq!(denied.code(), Code::Unauthenticated);
    f.store
        .delete(&Path::from(format!(
            "accounts/{}/bazel/cas/{}",
            f.account, value.hash
        )))
        .await
        .unwrap();
    let stale = ac
        .get_action_result(re::GetActionResultRequest {
            instance_name: instance,
            action_digest: Some(action),
            ..Default::default()
        })
        .await
        .unwrap_err();
    assert_eq!(stale.code(), Code::NotFound);
}

#[tokio::test]
async fn grpc_bytestream_resumes_uploads_and_serves_ranges() {
    let f = fixture().await;
    let mut client = bs::byte_stream_client::ByteStreamClient::connect(f.url.clone())
        .await
        .unwrap();
    let data = b"artifact";
    let value = digest(data);
    let prefix = format!("accounts/{}", f.account);
    let resource = format!(
        "{prefix}/uploads/resumable/blobs/{}/{}",
        value.hash, value.size_bytes
    );
    let incomplete = client
        .write(auth(
            tokio_stream::iter(vec![bs::WriteRequest {
                resource_name: resource.clone(),
                write_offset: 0,
                data: data[..2].to_vec(),
                finish_write: false,
            }]),
            &f.token,
        ))
        .await
        .unwrap_err();
    assert_eq!(incomplete.code(), Code::InvalidArgument);
    let progress = client
        .query_write_status(auth(
            bs::QueryWriteStatusRequest {
                resource_name: resource.clone(),
            },
            &f.token,
        ))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(progress.committed_size, 2);
    assert!(!progress.complete);
    let complete = client
        .write(auth(
            tokio_stream::iter(vec![bs::WriteRequest {
                resource_name: resource.clone(),
                write_offset: 2,
                data: data[2..].to_vec(),
                finish_write: true,
            }]),
            &f.token,
        ))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(complete.committed_size, 8);
    assert!(
        client
            .query_write_status(auth(
                bs::QueryWriteStatusRequest {
                    resource_name: resource
                },
                &f.token
            ))
            .await
            .unwrap()
            .into_inner()
            .complete
    );
    let mut stream = client
        .read(bs::ReadRequest {
            resource_name: format!("{prefix}/blobs/{}/8", value.hash),
            read_offset: 1,
            read_limit: 3,
        })
        .await
        .unwrap()
        .into_inner();
    let mut output = Vec::new();
    while let Some(part) = stream.message().await.unwrap() {
        output.extend(part.data);
    }
    assert_eq!(output, b"rti");
    let expected = digest(b"expected");
    let bad = client
        .write(auth(
            tokio_stream::iter(vec![bs::WriteRequest {
                resource_name: format!("{prefix}/uploads/bad/blobs/{}/8", expected.hash),
                write_offset: 0,
                data: b"corrupt!".to_vec(),
                finish_write: true,
            }]),
            &f.token,
        ))
        .await
        .unwrap_err();
    assert_eq!(bad.code(), Code::InvalidArgument);
    assert!(
        f.store
            .head(&Path::from(format!(
                "accounts/{}/bazel/cas/{}",
                f.account, expected.hash
            )))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn grpc_streaming_large_blobs_stays_within_default_client_message_limits() {
    let f = fixture().await;
    let mut client = bs::byte_stream_client::ByteStreamClient::connect(f.url.clone())
        .await
        .unwrap();
    let data = vec![7_u8; 10 * 1024 * 1024];
    let value = digest(&data);
    let prefix = format!("accounts/{}", f.account);
    let name = format!(
        "{prefix}/uploads/large/blobs/{}/{}",
        value.hash, value.size_bytes
    );
    let pieces = data
        .chunks(1024 * 1024)
        .enumerate()
        .map(|(index, piece)| bs::WriteRequest {
            resource_name: if index == 0 {
                name.clone()
            } else {
                String::new()
            },
            write_offset: (index * 1024 * 1024) as i64,
            data: piece.to_vec(),
            finish_write: index == 9,
        })
        .collect::<Vec<_>>();
    client
        .write(auth(tokio_stream::iter(pieces), &f.token))
        .await
        .unwrap();
    let mut output = client
        .read(bs::ReadRequest {
            resource_name: format!("{prefix}/blobs/{}/{}", value.hash, value.size_bytes),
            read_offset: 0,
            read_limit: 0,
        })
        .await
        .unwrap()
        .into_inner();
    let mut hash = Sha256::new();
    let mut size = 0;
    while let Some(message) = output.message().await.unwrap() {
        assert!(message.data.len() <= 1024 * 1024);
        size += message.data.len();
        hash.update(&message.data);
    }
    assert_eq!(size, data.len());
    assert_eq!(hex::encode(hash.finalize()), value.hash);
}
