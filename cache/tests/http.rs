use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use clap::Parser;
use fluentci_cache::{Config, router};
use futures_util::stream;
use object_store::{ObjectStore, memory::InMemory};
use sha2::{Digest, Sha256};
use std::{io, sync::Arc};
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

fn config() -> Config {
    Options::parse_from(["test", "--backend", "memory", "--token", "test-token"]).config
}

fn app() -> Router {
    router(config(), Arc::new(InMemory::new())).unwrap()
}

fn request(method: &str, path: &str, body: impl Into<Body>) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, "Bearer test-token")
        .body(body.into())
        .unwrap()
}

async fn bytes(response: axum::response::Response) -> bytes::Bytes {
    to_bytes(response.into_body(), 32 * 1024 * 1024)
        .await
        .unwrap()
}

#[tokio::test]
async fn all_protocols_round_trip_and_head() {
    let app = app();
    let digest = hex::encode(Sha256::digest(b"artifact"));
    for path in [
        format!("/cas/{digest}"),
        format!("/ac/{digest}"),
        format!("/bazel/cas/{digest}"),
        "/gradle/task".into(),
        "/sccache/a/b/key".into(),
        "/maven/v1/org.example/module/hash/buildinfo.xml".into(),
        "/generic/team/key".into(),
        "/gocache/action".into(),
        "/0123456789abcdfghijklmnpqrsvwxyz.narinfo".into(),
        "/nar/object.nar.zst".into(),
        "/nix/nar/object.nar.xz".into(),
    ] {
        let response = app
            .clone()
            .oneshot(request("PUT", &path, "artifact"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED, "{path}");
        let response = app
            .clone()
            .oneshot(request("GET", &path, Body::empty()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{path}");
        assert_eq!(bytes(response).await, "artifact");
        let response = app
            .clone()
            .oneshot(request("HEAD", &path, Body::empty()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "8");
        assert!(bytes(response).await.is_empty());
    }
}

#[tokio::test]
async fn public_reads_and_token_required_writes() {
    let app = app();
    for auth in [None, Some("Bearer wrong"), Some("Basic !!!")] {
        let mut builder = Request::builder().method("PUT").uri("/generic/key");
        if let Some(auth) = auth {
            builder = builder.header(header::AUTHORIZATION, auth);
        }
        let response = app
            .clone()
            .oneshot(builder.body(Body::from("bad")).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(response.headers().contains_key(header::WWW_AUTHENTICATE));
    }
    let auth = format!("Basic {}", STANDARD.encode("ci:test-token"));
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/generic/key")
                .header(header::AUTHORIZATION, auth)
                .body(Body::from("ok"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let response = app
        .oneshot(
            Request::builder()
                .uri("/generic/key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bytes(response).await, "ok");
}

#[tokio::test]
async fn private_reads_and_metrics_require_auth() {
    let mut config = config();
    config.public_read = false;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    for path in ["/generic/key", "/nix-cache-info", "/metrics", "/readyz"] {
        assert_eq!(
            app.clone()
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        app.clone()
            .oneshot(
                Request::builder()
                    .uri("/healthz")
                    .body(Body::empty())
                    .unwrap()
            )
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.clone()
            .oneshot(request("GET", "/readyz", Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn read_only_and_missing_write_token() {
    let mut config = config();
    config.token = None;
    assert!(router(config.clone(), Arc::new(InMemory::new())).is_err());
    config.read_only = true;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    assert_eq!(
        app.oneshot(request("PUT", "/generic/key", "value"))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn misses_and_namespace_isolation() {
    let app = app();
    app.clone()
        .oneshot(request("PUT", "/generic/key", "private namespace"))
        .await
        .unwrap();
    for path in [
        "/gradle/key",
        "/sccache/key",
        "/generic/absent",
        "/unknown/key",
    ] {
        let response = app
            .clone()
            .oneshot(request("GET", path, Body::empty()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    }
}

#[tokio::test]
async fn ranges_and_conditionals() {
    let app = app();
    app.clone()
        .oneshot(request("PUT", "/generic/key", "0123456789"))
        .await
        .unwrap();
    for (range, expected, content_range) in [
        ("bytes=2-5", "2345", "bytes 2-5/10"),
        ("bytes=7-", "789", "bytes 7-9/10"),
        ("bytes=-3", "789", "bytes 7-9/10"),
        ("bytes=8-99", "89", "bytes 8-9/10"),
    ] {
        let mut req = request("GET", "/generic/key", Body::empty());
        req.headers_mut()
            .insert(header::RANGE, range.parse().unwrap());
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()[header::CONTENT_RANGE], content_range);
        assert_eq!(bytes(response).await, expected);
    }
    for range in [
        "bytes=100-",
        "bytes=3-1",
        "bytes=-0",
        "bytes=0-1,4-5",
        "nonsense",
    ] {
        let mut req = request("GET", "/generic/key", Body::empty());
        req.headers_mut()
            .insert(header::RANGE, range.parse().unwrap());
        assert_eq!(
            app.clone().oneshot(req).await.unwrap().status(),
            StatusCode::RANGE_NOT_SATISFIABLE
        );
    }
    let response = app
        .clone()
        .oneshot(request("GET", "/generic/key", Body::empty()))
        .await
        .unwrap();
    let etag = response.headers()[header::ETAG].clone();
    assert!(etag.to_str().unwrap().starts_with('"'));
    drop(response);
    for (name, value, expected) in [
        (header::IF_NONE_MATCH, etag, StatusCode::NOT_MODIFIED),
        (
            header::IF_MATCH,
            "\"wrong\"".parse().unwrap(),
            StatusCode::PRECONDITION_FAILED,
        ),
    ] {
        let mut req = request("GET", "/generic/key", Body::empty());
        req.headers_mut().insert(name, value);
        assert_eq!(app.clone().oneshot(req).await.unwrap().status(), expected);
    }
}

#[tokio::test]
async fn nix_discovery_and_aliases() {
    let app = app();
    for path in ["/nix-cache-info", "/nix/nix-cache-info"] {
        let response = app
            .clone()
            .oneshot(request("GET", path, Body::empty()))
            .await
            .unwrap();
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/x-nix-cache-info"
        );
        assert_eq!(
            bytes(response).await,
            "StoreDir: /nix/store\nWantMassQuery: 0\nPriority: 40\n"
        );
        assert_eq!(
            app.clone()
                .oneshot(request("PUT", path, "bad"))
                .await
                .unwrap()
                .status(),
            StatusCode::FORBIDDEN
        );
    }
    app.clone()
        .oneshot(request("PUT", "/nix/hash.narinfo", "signed metadata"))
        .await
        .unwrap();
    let response = app
        .oneshot(request("GET", "/hash.narinfo", Body::empty()))
        .await
        .unwrap();
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "text/x-nix-narinfo"
    );
    assert_eq!(bytes(response).await, "signed metadata");
}

#[tokio::test]
async fn invalid_keys_and_methods() {
    let app = app();
    for path in [
        "/generic/../escape",
        "/generic/%2e%2e/escape",
        "/generic/a%2Fb/../c",
        "/generic/a%5Cb",
        "/generic/a//b",
        "/generic/%00",
        "/cas/short",
        "/bazel/unknown/key",
        "/generic",
    ] {
        assert_eq!(
            app.clone()
                .oneshot(request("PUT", path, "bad"))
                .await
                .unwrap()
                .status(),
            StatusCode::BAD_REQUEST,
            "{path}"
        );
    }
    for method in ["DELETE", "POST", "PATCH", "PROPFIND", "MKCOL"] {
        let response = app
            .clone()
            .oneshot(request(method, "/generic/key", Body::empty()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(response.headers()[header::ALLOW], "GET, HEAD, PUT");
    }
}

#[tokio::test]
async fn upload_limits_apply_to_declared_and_streamed_bodies() {
    let mut config = config();
    config.max_upload = 4;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    let mut req = request("PUT", "/generic/declared", "small");
    req.headers_mut()
        .insert(header::CONTENT_LENGTH, "5".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(req).await.unwrap().status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    let stream = stream::iter([
        Ok::<_, io::Error>(bytes::Bytes::from_static(b"123")),
        Ok(bytes::Bytes::from_static(b"45")),
    ]);
    assert_eq!(
        app.clone()
            .oneshot(request(
                "PUT",
                "/generic/streamed",
                Body::from_stream(stream)
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(
        app.oneshot(request("GET", "/generic/streamed", Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn cas_rejects_poisoning_without_replacing_previous_content() {
    let app = app();
    let path = format!("/cas/{}", hex::encode(Sha256::digest(b"valid")));
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", &path, "valid"))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", &path, "invalid"))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        bytes(
            app.oneshot(request("GET", &path, Body::empty()))
                .await
                .unwrap()
        )
        .await,
        "valid"
    );
}

#[tokio::test]
async fn multipart_upload_and_interrupted_overwrite_are_atomic() {
    let app = app();
    let payload = bytes::Bytes::from(vec![42; 17 * 1024 * 1024 + 7]);
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", "/generic/large", payload.clone()))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    let chunks = stream::iter([
        Ok(bytes::Bytes::from(vec![9; 9 * 1024 * 1024])),
        Err(io::Error::other("client disconnected")),
    ]);
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", "/generic/large", Body::from_stream(chunks)))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        bytes(
            app.clone()
                .oneshot(request("GET", "/generic/large", Body::empty()))
                .await
                .unwrap()
        )
        .await,
        payload
    );
}

#[tokio::test]
async fn download_holds_concurrency_permit_until_consumed_or_dropped() {
    let mut config = config();
    config.concurrency = 1;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    app.clone()
        .oneshot(request("PUT", "/generic/key", "data"))
        .await
        .unwrap();
    let download = app
        .clone()
        .oneshot(request("GET", "/generic/key", Body::empty()))
        .await
        .unwrap();
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", "/generic/other", "data"))
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    drop(download);
    assert_eq!(
        app.oneshot(request("PUT", "/generic/other", "data"))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
}

#[tokio::test]
async fn upload_deadline_does_not_publish_partial_objects() {
    let mut config = config();
    config.timeout = 1;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    let stalled = stream::once(async {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        Ok::<_, io::Error>(bytes::Bytes::from_static(b"late"))
    });
    assert_eq!(
        app.clone()
            .oneshot(request(
                "PUT",
                "/generic/stalled",
                Body::from_stream(stalled)
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::REQUEST_TIMEOUT
    );
    assert_eq!(
        app.oneshot(request("GET", "/generic/stalled", Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn filesystem_persists_across_router_restarts() {
    let directory = tempfile::tempdir().unwrap();
    let mut config = config();
    config.backend = fluentci_cache::config::Backend::File;
    config.directory = directory.path().to_owned();
    let first = router(config.clone(), config.storage().unwrap()).unwrap();
    first
        .oneshot(request("PUT", "/generic/key", "persisted"))
        .await
        .unwrap();
    let second = router(config.clone(), config.storage().unwrap()).unwrap();
    assert_eq!(
        bytes(
            second
                .oneshot(request("GET", "/generic/key", Body::empty()))
                .await
                .unwrap()
        )
        .await,
        "persisted"
    );
}

#[tokio::test]
async fn metrics_record_reads_writes_and_misses() {
    let app = app();
    app.clone()
        .oneshot(request("PUT", "/generic/key", "abc"))
        .await
        .unwrap();
    bytes(
        app.clone()
            .oneshot(request("GET", "/generic/key", Body::empty()))
            .await
            .unwrap(),
    )
    .await;
    app.clone()
        .oneshot(request("GET", "/generic/missing", Body::empty()))
        .await
        .unwrap();
    let metrics = bytes(
        app.oneshot(request("GET", "/metrics", Body::empty()))
            .await
            .unwrap(),
    )
    .await;
    let metrics = String::from_utf8(metrics.to_vec()).unwrap();
    for expected in [
        "fluentci_cache_requests_total 3",
        "fluentci_cache_hits_total 1",
        "fluentci_cache_misses_total 1",
        "fluentci_cache_writes_total 1",
        "fluentci_cache_bytes_written_total 3",
    ] {
        assert!(metrics.contains(expected), "{metrics}");
    }
}

#[tokio::test]
async fn oversized_cas_mismatch_never_commits_multipart() {
    let app = app();
    let path = format!("/cas/{}", "0".repeat(64));
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", &path, vec![7; 9 * 1024 * 1024]))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        app.oneshot(request("GET", &path, Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
#[ignore = "requires an S3-compatible service; see README"]
async fn s3_backend_round_trip() {
    let mut config = config();
    config.backend = fluentci_cache::config::Backend::S3;
    config.bucket = Some(std::env::var("FLUENTCI_CACHE_TEST_BUCKET").expect("set test bucket"));
    config.endpoint = std::env::var("FLUENTCI_CACHE_TEST_ENDPOINT").ok();
    config.allow_http = config
        .endpoint
        .as_ref()
        .is_some_and(|v| v.starts_with("http://"));
    config.prefix = format!(
        "fluentci-cache-tests/{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let store = config.storage().unwrap();
    let app = router(config, store.clone()).unwrap();
    let payload = bytes::Bytes::from(vec![3; 17 * 1024 * 1024]);
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", "/generic/large", payload.clone()))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert_eq!(
        bytes(
            app.clone()
                .oneshot(request("GET", "/generic/large", Body::empty()))
                .await
                .unwrap()
        )
        .await,
        payload
    );
    let mut ranged = request("GET", "/generic/large", Body::empty());
    ranged
        .headers_mut()
        .insert(header::RANGE, "bytes=3-7".parse().unwrap());
    let ranged = app.clone().oneshot(ranged).await.unwrap();
    assert_eq!(ranged.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(bytes(ranged).await, vec![3; 5]);
    assert_eq!(
        app.clone()
            .oneshot(request("HEAD", "/generic/large", Body::empty()))
            .await
            .unwrap()
            .headers()[header::CONTENT_LENGTH],
        (17 * 1024 * 1024).to_string()
    );
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", "/generic/small", "small"))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert_eq!(
        bytes(
            app.oneshot(request("GET", "/generic/small", Body::empty()))
                .await
                .unwrap()
        )
        .await,
        "small"
    );
    store
        .delete(&object_store::path::Path::from("generic/small"))
        .await
        .unwrap();
    store
        .delete(&object_store::path::Path::from("generic/large"))
        .await
        .unwrap();
}
