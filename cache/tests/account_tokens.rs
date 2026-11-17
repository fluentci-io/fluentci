use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use base64::Engine;
use clap::Parser;
use fluentci_cache::{Config, router};
use object_store::{ObjectStore, memory::InMemory, path::Path};
use std::sync::Arc;
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

#[tokio::test]
async fn node_signed_tokens_are_account_scoped_and_public_reads_need_no_token() {
    // Public fixture signed with Node's Ed25519 implementation; no private key is retained.
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/upload-tokens.json")).unwrap();
    let directory = tempfile::tempdir().unwrap();
    let pem = directory.path().join("public.pem");
    std::fs::write(&pem, fixture["publicKey"].as_str().unwrap()).unwrap();
    let mut config =
        Options::parse_from(["test", "--backend", "memory", "--token", "admin"]).config;
    config.upload_token_public_key_file = Some(pem);
    let store = Arc::new(InMemory::new());
    let app = router(config.clone(), store.clone()).unwrap();
    let account = "a".repeat(64);
    let path = format!("/accounts/{account}/generic/object");
    let token = fixture["valid"].as_str().unwrap();
    let send = |method: &str, path: &str, auth: Option<String>| {
        let mut request = Request::builder().method(method).uri(path);
        if let Some(auth) = auth {
            request = request.header(header::AUTHORIZATION, auth);
        }
        app.clone()
            .oneshot(request.body(Body::from("artifact")).unwrap())
    };
    assert_eq!(
        send("PUT", &path, Some(format!("Bearer {token}")))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert!(
        store
            .head(&Path::from(format!("accounts/{account}/generic/object")))
            .await
            .is_ok()
    );
    for method in ["GET", "HEAD"] {
        assert_eq!(
            send(method, &path, None).await.unwrap().status(),
            StatusCode::OK
        );
    }
    assert_eq!(
        send("PUT", &path, None).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    for denied in [
        "/generic/object".to_string(),
        format!("/accounts/{}/generic/object", "b".repeat(64)),
        "/metrics".into(),
        "/readyz".into(),
    ] {
        let method = if denied.starts_with("/accounts") || denied.starts_with("/generic") {
            "PUT"
        } else {
            "GET"
        };
        assert_eq!(
            send(method, &denied, Some(format!("Bearer {token}")))
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED,
            "{denied}"
        );
    }
    for name in [
        "expired",
        "future",
        "wrongIssuer",
        "wrongAudience",
        "wrongScope",
        "wrongAlgorithm",
    ] {
        let invalid = fixture[name].as_str().unwrap();
        assert_eq!(
            send("PUT", &path, Some(format!("Bearer {invalid}")))
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED,
            "{name}"
        );
    }
    let tampered = format!("{token}a");
    assert_eq!(
        send("PUT", &path, Some(format!("Bearer {tampered}")))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    // Support cache clients which send a Basic-auth password instead of a bearer token.
    let basic = base64::engine::general_purpose::STANDARD.encode(format!("user:{token}"));
    assert_eq!(
        send("PUT", &path, Some(format!("Basic {basic}")))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    config.public_read = false;
    let private = router(config, store).unwrap();
    let response = private
        .oneshot(
            Request::builder()
                .uri(&path)
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
