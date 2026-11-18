use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::Query,
    http::{Request, StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use clap::Parser;
use fluentci_cache::{Config, router};
use object_store::memory::InMemory;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

fn request(method: &str, path: &str, token: Option<&str>, body: &str) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header(header::CONTENT_LENGTH, body.len());
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    builder.body(Body::from(body.to_owned())).unwrap()
}

#[tokio::test]
async fn did_handle_and_legacy_urls_share_storage_without_changing_token_scope() {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/alias-tokens.json")).unwrap();
    let owner = fixture["owner"].as_str().unwrap();
    let hash = fixture["cache"].as_str().unwrap();
    let token = fixture["token"].as_str().unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let seen = calls.clone();
    let identity = json!({"owner": owner, "cacheId": hash});
    let resolver = Router::new().route(
        "/resolve",
        get(move |Query(query): Query<HashMap<String, String>>| {
            let identity = identity.clone();
            seen.fetch_add(1, Ordering::SeqCst);
            async move {
                if query.get("actor").map(String::as_str) == Some("owner.test") {
                    Json(identity).into_response()
                } else {
                    StatusCode::NOT_FOUND.into_response()
                }
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/resolve", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, resolver).await.unwrap();
    });
    let directory = tempfile::tempdir().unwrap();
    let public_key = directory.path().join("public.pem");
    std::fs::write(&public_key, fixture["publicKey"].as_str().unwrap()).unwrap();
    let mut config =
        Options::parse_from(["test", "--backend", "memory", "--token", "admin"]).config;
    config.allow_http = true;
    config.identity_resolver_url = url;
    config.upload_token_public_key_file = Some(public_key);
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    let aliases = [
        format!("/{owner}"),
        "/@owner.test".into(),
        format!("/accounts/{hash}"),
    ];
    for base in &aliases {
        assert_eq!(
            app.clone()
                .oneshot(request(
                    "PUT",
                    &format!("{base}/generic/key"),
                    Some(token),
                    "artifact"
                ))
                .await
                .unwrap()
                .status(),
            StatusCode::CREATED
        );
        for read in &aliases {
            let response = app
                .clone()
                .oneshot(request("GET", &format!("{read}/generic/key"), None, ""))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                to_bytes(response.into_body(), 100).await.unwrap(),
                "artifact"
            );
        }
        assert_eq!(
            app.clone()
                .oneshot(request("PUT", &format!("{base}/generic/key"), None, "bad"))
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "verified handles cached for request bursts"
    );
    for base in [
        "/did:plc:bbbbbbbbbbbbbbbbbbbbbbbb".to_owned(),
        format!("/accounts/{}", "b".repeat(64)),
    ] {
        assert_eq!(
            app.clone()
                .oneshot(request(
                    "PUT",
                    &format!("{base}/generic/key"),
                    Some(token),
                    "wrong owner"
                ))
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        app.clone()
            .oneshot(request(
                "GET",
                "/@missing.test/nix/nix-cache-info",
                None,
                ""
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.clone()
            .oneshot(request("GET", "/@bad_handle/nix/nix-cache-info", None, ""))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        app.clone()
            .oneshot(request(
                "GET",
                "/did:plc:invalid/nix/nix-cache-info",
                None,
                ""
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    // Non-Nix protocols route to their original handlers as well.
    assert_eq!(
        app.clone()
            .oneshot(request(
                "GET",
                "/@owner.test/turbo/v8/artifacts/status",
                Some(token),
                ""
            ))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.oneshot(request(
            "PUT",
            &format!("/{owner}/nx/v1/cache/test-hash"),
            Some(token),
            "artifact"
        ))
        .await
        .unwrap()
        .status(),
        StatusCode::OK
    );
    server.abort();
}
