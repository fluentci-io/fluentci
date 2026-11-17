use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use clap::Parser;
use fluentci_cache::{Config, router};
use object_store::memory::InMemory;
use serde_json::{Value, json};
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

fn request(method: &str, path: &str, body: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, "Bearer admin")
        .header(header::CONTENT_LENGTH, body.len())
        .body(Body::from(body.to_owned()))
        .unwrap()
}

#[tokio::test]
async fn nx_uploads_are_immutable_and_account_scoped() {
    let app = app();
    let account = "a".repeat(64);
    let path = format!("/accounts/{account}/nx/v1/cache/1234567890");
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", &path, "first"))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", &path, "other"))
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    let response = app
        .clone()
        .oneshot(request("GET", &path, ""))
        .await
        .unwrap();
    assert_eq!(to_bytes(response.into_body(), 1024).await.unwrap(), "first");
    assert_eq!(
        app.oneshot(request("GET", &path.replace(&account, &"b".repeat(64)), ""))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn turbo_preserves_signatures_metadata_and_range_reads() {
    let app = app();
    let account = "a".repeat(64);
    let base = format!("/accounts/{account}/turbo/v8/artifacts");
    let path = format!("{base}/abcdef0123?slug={account}");
    let mut put = request("PUT", &path, "0123456789");
    put.headers_mut().insert(
        "x-artifact-tag",
        "client-generated-hmac-signature".parse().unwrap(),
    );
    put.headers_mut()
        .insert("x-artifact-duration", "1234".parse().unwrap());
    put.headers_mut()
        .insert("x-artifact-sha", "deadbeef".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(put).await.unwrap().status(),
        StatusCode::ACCEPTED
    );
    for method in ["GET", "HEAD"] {
        let response = app
            .clone()
            .oneshot(request(method, &path, ""))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["x-artifact-tag"],
            "client-generated-hmac-signature"
        );
        assert_eq!(response.headers()["x-artifact-duration"], "1234");
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "10");
        assert_eq!(
            to_bytes(response.into_body(), 1024).await.unwrap(),
            if method == "HEAD" { "" } else { "0123456789" }
        );
    }
    let mut range = request("GET", &path, "");
    range
        .headers_mut()
        .insert(header::RANGE, "bytes=2-4".parse().unwrap());
    let response = app.clone().oneshot(range).await.unwrap();
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(to_bytes(response.into_body(), 1024).await.unwrap(), "234");
    assert_eq!(
        app.clone()
            .oneshot(request(
                "PUT",
                &format!("{base}/abcdef?slug=another-team"),
                "x"
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    let status = app
        .clone()
        .oneshot(request("GET", &format!("{base}/status"), ""))
        .await
        .unwrap();
    assert_eq!(status.status(), StatusCode::OK);
    let response = app
        .clone()
        .oneshot(request(
            "POST",
            &base,
            &json!({"hashes":["abcdef0123","ffffff"]}).to_string(),
        ))
        .await
        .unwrap();
    let body: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(body["abcdef0123"]["size"], 10);
    assert!(body["ffffff"].is_null());
    assert_eq!(
        app.oneshot(request("POST", &format!("{base}/events"), "[]"))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn monorepo_writes_require_tokens_and_reject_invalid_metadata() {
    let app = app();
    let account = "a".repeat(64);
    let path = format!("/accounts/{account}/turbo/artifacts/abcdef");
    let mut bad = request("PUT", &path, "x");
    bad.headers_mut().remove(header::AUTHORIZATION);
    assert_eq!(
        app.clone().oneshot(bad).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    let mut bad = request("PUT", &path, "x");
    bad.headers_mut()
        .insert("x-artifact-duration", "invalid".parse().unwrap());
    assert_eq!(
        app.clone().oneshot(bad).await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
    let mut bad = request("PUT", &path, "x");
    bad.headers_mut().remove(header::CONTENT_LENGTH);
    assert_eq!(
        app.oneshot(bad).await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
}
