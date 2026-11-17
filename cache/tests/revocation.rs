use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use clap::Parser;
use fluentci_cache::{Config, router};
use object_store::local::LocalFileSystem;
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

async fn send(app: &axum::Router, method: &str, path: &str, token: &str, body: &str) -> StatusCode {
    app.clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_owned()))
                .unwrap(),
        )
        .await
        .unwrap()
        .status()
}

#[tokio::test]
async fn revocation_survives_restart_and_clear_and_denies_every_upload_adapter() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/revocation-tokens.json")).unwrap();
    let directory = tempfile::tempdir().unwrap();
    let pem = directory.path().join("public.pem");
    std::fs::write(&pem, fixture["publicKey"].as_str().unwrap()).unwrap();
    let storage = directory.path().join("objects");
    std::fs::create_dir(&storage).unwrap();
    let mut config = Options::parse_from(["test", "--backend", "file", "--token", "admin"]).config;
    config.upload_token_public_key_file = Some(pem);
    let store = Arc::new(LocalFileSystem::new_with_prefix(&storage).unwrap());
    let app = router(config.clone(), store.clone()).unwrap();
    let account = fixture["account"].as_str().unwrap();
    let upload = fixture["upload"].as_str().unwrap();
    let manage = fixture["manage"].as_str().unwrap();
    let base = format!("/accounts/{account}");
    let path = format!("{base}/generic/artifact");
    assert_eq!(
        send(&app, "PUT", &path, upload, "data").await,
        StatusCode::CREATED
    );
    let revoke = json!({"action":"revokeToken", "id":fixture["id"]}).to_string();
    assert_eq!(
        send(&app, "POST", &format!("{base}/_admin"), upload, &revoke).await,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        send(&app, "POST", &format!("{base}/_admin"), manage, &revoke).await,
        StatusCode::OK
    );
    for (method, path) in [
        ("PUT", path.clone()),
        ("PUT", format!("{base}/nx/v1/cache/key")),
        ("PUT", format!("{base}/turbo/v8/artifacts/key")),
        (
            "POST",
            format!("/v2/accounts/{account}/buildkit/project/blobs/uploads/"),
        ),
    ] {
        assert_eq!(
            send(&app, method, &path, upload, "data").await,
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        send(
            &app,
            "PUT",
            &path,
            fixture["other"].as_str().unwrap(),
            "data"
        )
        .await,
        StatusCode::CREATED
    );
    assert_eq!(
        send(
            &app,
            "POST",
            &format!("{base}/_admin"),
            manage,
            r#"{"action":"clear","confirm":true}"#
        )
        .await,
        StatusCode::OK
    );
    drop(app);
    let restarted = router(config, store).unwrap();
    assert_eq!(
        send(&restarted, "PUT", &path, upload, "data").await,
        StatusCode::UNAUTHORIZED
    );
}
