use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use clap::Parser;
use fluentci_cache::{Config, router};
use object_store::memory::InMemory;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

fn app() -> axum::Router {
    router(
        Options::parse_from(["test", "--backend", "memory", "--token", "admin"]).config,
        Arc::new(InMemory::new()),
    )
    .unwrap()
}

fn request(method: &str, path: &str, data: impl Into<Body>) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, "Bearer admin")
        .body(data.into())
        .unwrap()
}

async fn upload(app: &axum::Router, base: &str, data: &[u8]) -> String {
    let hash = format!("sha256:{}", hex::encode(Sha256::digest(data)));
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            &format!("{base}/blobs/uploads/?digest={hash}"),
            data.to_vec(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    assert_eq!(response.headers()["docker-content-digest"], hash);
    hash
}

#[tokio::test]
async fn registry_resumes_uploads_and_validates_blob_digests() {
    let app = app();
    let base = format!("/v2/accounts/{}/buildkit/project", "a".repeat(64));
    let hash = format!("sha256:{}", hex::encode(Sha256::digest(b"artifact")));
    assert_eq!(
        app.clone()
            .oneshot(request("GET", "/v2/", ""))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    let response = app
        .clone()
        .oneshot(request("POST", &format!("{base}/blobs/uploads/"), ""))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let location = response.headers()[header::LOCATION]
        .to_str()
        .unwrap()
        .to_owned();
    let mut patch = request("PATCH", &location, "ar");
    patch
        .headers_mut()
        .insert(header::CONTENT_RANGE, "0-1".parse().unwrap());
    let response = app.clone().oneshot(patch).await.unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(response.headers()[header::RANGE], "0-1");
    let response = app
        .clone()
        .oneshot(request("GET", &location, ""))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(response.headers()[header::RANGE], "0-1");
    let mut bad = request("PATCH", &location, "tifact");
    bad.headers_mut()
        .insert(header::CONTENT_RANGE, "0-5".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(bad).await.unwrap().status(),
        StatusCode::RANGE_NOT_SATISFIABLE
    );
    let mut patch = request("PATCH", &location, "tifact");
    patch
        .headers_mut()
        .insert(header::CONTENT_RANGE, "2-7".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(patch).await.unwrap().status(),
        StatusCode::ACCEPTED
    );
    let response = app
        .clone()
        .oneshot(request("PUT", &format!("{location}?digest={hash}"), ""))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let mut get = Request::builder()
        .uri(format!("{base}/blobs/{hash}"))
        .header(header::RANGE, "bytes=1-3")
        .body(Body::empty())
        .unwrap();
    get.headers_mut().remove(header::AUTHORIZATION);
    let response = app.clone().oneshot(get).await.unwrap();
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(to_bytes(response.into_body(), 8192).await.unwrap(), "rti");
    assert_eq!(
        app.clone()
            .oneshot(request("GET", &location, ""))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    let wrong = format!("sha256:{}", "b".repeat(64));
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            &format!("{base}/blobs/uploads/?digest={wrong}"),
            "bad bytes",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        app.oneshot(request("HEAD", &format!("{base}/blobs/{wrong}"), ""))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn registry_publishes_buildkit_manifests_indexes_tags_and_cross_repository_mounts() {
    let app = app();
    let account = "a".repeat(64);
    let base = format!("/v2/accounts/{account}/source");
    let data = b"{}";
    let blob = upload(&app, &base, data).await;
    let document = json!({"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"mediaType":"application/vnd.buildkit.cacheconfig.v0","digest":blob,"size":data.len()},"layers":[]});
    let bytes = document.to_string();
    let mut put = request(
        "PUT",
        &format!("{base}/manifests/buildcache"),
        bytes.clone(),
    );
    put.headers_mut().insert(
        header::CONTENT_TYPE,
        "application/vnd.oci.image.manifest.v1+json"
            .parse()
            .unwrap(),
    );
    let response = app.clone().oneshot(put).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let digest = response.headers()["docker-content-digest"]
        .to_str()
        .unwrap()
        .to_owned();
    let response = app
        .clone()
        .oneshot(request("GET", &format!("{base}/manifests/buildcache"), ""))
        .await
        .unwrap();
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/vnd.oci.image.manifest.v1+json"
    );
    assert_eq!(to_bytes(response.into_body(), 8192).await.unwrap(), bytes);
    let response = app
        .clone()
        .oneshot(request("HEAD", &format!("{base}/manifests/{digest}"), ""))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()[header::CONTENT_LENGTH],
        bytes.len().to_string()
    );
    let index = json!({"schemaVersion":2,"mediaType":"application/vnd.oci.image.index.v1+json","manifests":[{"mediaType":"application/vnd.oci.image.manifest.v1+json","digest":digest,"size":bytes.len()}]});
    let mut put = request("PUT", &format!("{base}/manifests/index"), index.to_string());
    put.headers_mut().insert(
        header::CONTENT_TYPE,
        "application/vnd.oci.image.index.v1+json".parse().unwrap(),
    );
    assert_eq!(
        app.clone().oneshot(put).await.unwrap().status(),
        StatusCode::CREATED
    );
    let response = app
        .clone()
        .oneshot(request("GET", &format!("{base}/tags/list?n=1"), ""))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key(header::LINK));
    let value: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(value["tags"], json!(["buildcache"]));
    let response=app.clone().oneshot(request("POST",&format!("/v2/accounts/{account}/destination/blobs/uploads/?mount={blob}&from=accounts/{account}/source"),"")).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/v2/accounts/{account}/destination/blobs/{blob}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        to_bytes(response.into_body(), 8192).await.unwrap(),
        data.as_slice()
    );
}

#[tokio::test]
async fn registry_rejects_bad_credentials_and_abort_releases_staging_budget() {
    let mut config =
        Options::parse_from(["test", "--backend", "memory", "--token", "admin"]).config;
    config.staging_limit = 4;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    let base = format!("/v2/accounts/{}/project", "a".repeat(64));
    let mut invalid = request("GET", "/v2/", "");
    invalid
        .headers_mut()
        .insert(header::AUTHORIZATION, "Bearer invalid".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(invalid).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    let response = app
        .clone()
        .oneshot(request("POST", &format!("{base}/blobs/uploads/"), "data"))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let location = response.headers()[header::LOCATION]
        .to_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        app.clone()
            .oneshot(request("POST", &format!("{base}/blobs/uploads/"), "more"))
            .await
            .unwrap()
            .status(),
        StatusCode::INSUFFICIENT_STORAGE
    );
    assert_eq!(
        app.clone()
            .oneshot(request("DELETE", &location, ""))
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.clone()
            .oneshot(request("POST", &format!("{base}/blobs/uploads/"), "more"))
            .await
            .unwrap()
            .status(),
        StatusCode::ACCEPTED
    );
    let unauth = Request::builder()
        .method("POST")
        .uri(format!("{base}/blobs/uploads/"))
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.oneshot(unauth).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
}
