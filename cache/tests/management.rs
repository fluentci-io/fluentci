use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode, header},
};
use clap::Parser;
use fluentci_cache::{Config, router};
use object_store::{ObjectStore, memory::InMemory, path::Path};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

#[tokio::test]
async fn owner_management_paginates_totals_and_deletes_only_own_cache() {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/manage-tokens.json")).unwrap();
    let directory = tempfile::tempdir().unwrap();
    let pem = directory.path().join("public.pem");
    std::fs::write(&pem, fixture["publicKey"].as_str().unwrap()).unwrap();
    let mut config =
        Options::parse_from(["test", "--backend", "memory", "--token", "admin"]).config;
    config.upload_token_public_key_file = Some(pem);
    let store = Arc::new(InMemory::new());
    let account = fixture["account"].as_str().unwrap();
    let base = format!("accounts/{account}");
    for key in [
        format!("{base}/generic/a"),
        format!("{base}/generic/b"),
        format!("{base}/gradle/c"),
        "generic/shared".into(),
        format!("accounts/{}/generic/other", "b".repeat(64)),
    ] {
        store.put(&Path::from(key), "data".into()).await.unwrap();
    }
    let app = router(config.clone(), store.clone()).unwrap();
    let send = |account: &str, token: Option<String>, input: Value| {
        let mut request = Request::builder()
            .method("POST")
            .uri(format!("/accounts/{account}/_admin"))
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(token) = token {
            request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
        }
        app.clone()
            .oneshot(request.body(Body::from(input.to_string())).unwrap())
    };
    let token = || Some(fixture["manage"].as_str().unwrap().to_owned());
    for auth in [
        None,
        Some(fixture["upload"].as_str().unwrap().into()),
        Some(fixture["invitee"].as_str().unwrap().into()),
    ] {
        assert_eq!(
            send(account, auth, json!({"action":"clear","confirm":true}))
                .await
                .unwrap()
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        send(&"b".repeat(64), token(), json!({"action":"list"}))
            .await
            .unwrap()
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let first = send(
        account,
        token(),
        json!({"action":"list","prefix":"generic/","limit":1}),
    )
    .await
    .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let first: Value =
        serde_json::from_slice(&to_bytes(first.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(first["totalBytes"], 12);
    assert_eq!(first["totalKeys"], 3);
    assert_eq!(first["keys"][0]["key"], "generic/a");
    let next = send(
        account,
        token(),
        json!({"action":"list","prefix":"generic/","limit":1,"cursor":first["cursor"]}),
    )
    .await
    .unwrap();
    let next: Value =
        serde_json::from_slice(&to_bytes(next.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(next["keys"][0]["key"], "generic/b");
    assert!(next["cursor"].is_null());
    assert_eq!(
        send(
            account,
            token(),
            json!({"action":"delete","key":"../generic/shared"})
        )
        .await
        .unwrap()
        .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        send(
            account,
            token(),
            json!({"action":"delete","key":"generic/a"})
        )
        .await
        .unwrap()
        .status(),
        StatusCode::OK
    );
    assert!(
        store
            .head(&Path::from(format!("{base}/generic/a")))
            .await
            .is_err()
    );
    assert_eq!(
        send(account, token(), json!({"action":"clear"}))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_REQUEST
    );
    let cleared = send(account, token(), json!({"action":"clear","confirm":true}))
        .await
        .unwrap();
    let cleared: Value =
        serde_json::from_slice(&to_bytes(cleared.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(cleared["deleted"], 2);
    assert!(store.head(&Path::from("generic/shared")).await.is_ok());
    assert!(
        store
            .head(&Path::from(format!(
                "accounts/{}/generic/other",
                "b".repeat(64)
            )))
            .await
            .is_ok()
    );
    config.read_only = true;
    let readonly = router(config.clone(), store.clone()).unwrap();
    assert_eq!(
        readonly
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/accounts/{account}/_admin"))
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(
                        header::AUTHORIZATION,
                        format!("Bearer {}", fixture["manage"].as_str().unwrap())
                    )
                    .body(Body::from("{\"action\":\"clear\",\"confirm\":true}"))
                    .unwrap()
            )
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn public_read_only_cache_does_not_expose_management_without_admin_configuration() {
    let config = Options::parse_from(["test", "--backend", "memory", "--read-only"]).config;
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/accounts/{}/_admin", "a".repeat(64)))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from("{\"action\":\"list\"}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
