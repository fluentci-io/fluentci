use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::any,
};
use clap::Parser;
use fluentci_cache::{Config, config::Backend, router};
use object_store::{ObjectStore, memory::InMemory, path::Path};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

fn config() -> Config {
    Options::parse_from(["test", "--backend", "memory", "--token", "write-token"]).config
}

#[derive(Clone)]
struct Cdn {
    origin: Router,
    requests: Arc<Mutex<Vec<(Method, String, bool)>>>,
}

async fn cdn(State(cdn): State<Cdn>, mut request: Request) -> Response {
    cdn.requests.lock().unwrap().push((
        request.method().clone(),
        request.uri().path().to_owned(),
        request.headers().contains_key(header::AUTHORIZATION),
    ));
    let Some(path) = request.uri().path().strip_prefix("/bucket/team/cache/") else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if path == "generic/broken" {
        return StatusCode::FORBIDDEN.into_response();
    }
    *request.uri_mut() = format!("/{path}").parse().unwrap();
    cdn.origin.oneshot(request).await.unwrap()
}

async fn fixture() -> (Router, Arc<InMemory>, Cdn, tokio::task::JoinHandle<()>) {
    let read_store = Arc::new(InMemory::new());
    read_store
        .put(&Path::from("generic/key"), "0123456789".into())
        .await
        .unwrap();
    let cdn = Cdn {
        origin: router(config(), read_store).unwrap(),
        requests: Arc::default(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut config = config();
    config.backend = Backend::S3;
    config.prefix = "team/cache".into();
    config.public_read = false;
    config.cdn_url = Some(format!("http://{}/bucket/", listener.local_addr().unwrap()));
    let service = Router::new()
        .fallback(any(self::cdn))
        .with_state(cdn.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, service).await.unwrap();
    });
    let writes = Arc::new(InMemory::new());
    let app = router(config, writes.clone()).unwrap();
    (app, writes, cdn, task)
}

fn request(method: &str, path: &str, body: impl Into<Body>) -> Request {
    Request::builder()
        .method(method)
        .uri(path)
        .header(header::AUTHORIZATION, "Bearer write-token")
        .body(body.into())
        .unwrap()
}

#[tokio::test]
async fn s3_reads_use_cdn_for_get_head_ranges_and_conditionals_without_forwarding_tokens() {
    let (app, writes, cdn, server) = fixture().await;
    let response = app
        .clone()
        .oneshot(request("GET", "/generic/key", Body::empty()))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let etag = response.headers()[header::ETAG].clone();
    assert_eq!(
        to_bytes(response.into_body(), 1024).await.unwrap(),
        "0123456789"
    );
    assert!(writes.head(&Path::from("generic/key")).await.is_err());
    let response = app
        .clone()
        .oneshot(request("HEAD", "/generic/key", Body::empty()))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CONTENT_LENGTH], "10");
    assert!(
        to_bytes(response.into_body(), 1024)
            .await
            .unwrap()
            .is_empty()
    );
    let mut ranged = request("GET", "/generic/key", Body::empty());
    ranged
        .headers_mut()
        .insert(header::RANGE, "bytes=3-5".parse().unwrap());
    let response = app.clone().oneshot(ranged).await.unwrap();
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 3-5/10");
    assert_eq!(to_bytes(response.into_body(), 1024).await.unwrap(), "345");
    let mut conditional = request("GET", "/generic/key", Body::empty());
    conditional
        .headers_mut()
        .insert(header::IF_NONE_MATCH, etag);
    assert_eq!(
        app.oneshot(conditional).await.unwrap().status(),
        StatusCode::NOT_MODIFIED
    );
    let requests = cdn.requests.lock().unwrap();
    assert_eq!(requests.len(), 5);
    assert!(
        requests
            .iter()
            .all(|(_, path, auth)| path == "/bucket/team/cache/generic/key" && !auth)
    );
    assert!(
        requests
            .iter()
            .any(|(method, _, _)| *method == Method::HEAD)
    );
    server.abort();
}

#[tokio::test]
async fn writes_never_use_cdn_and_cdn_misses_never_fall_back_to_origin() {
    let (app, writes, cdn, server) = fixture().await;
    assert_eq!(
        app.clone()
            .oneshot(request("PUT", "/generic/new", "new artifact"))
            .await
            .unwrap()
            .status(),
        StatusCode::CREATED
    );
    assert!(cdn.requests.lock().unwrap().is_empty());
    assert_eq!(
        writes
            .get(&Path::from("generic/new"))
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap(),
        "new artifact"
    );
    assert_eq!(
        app.clone()
            .oneshot(request("GET", "/generic/new", Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.clone()
            .oneshot(request("GET", "/generic/broken", Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::BAD_GATEWAY
    );
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/generic/key")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let response = app
        .clone()
        .oneshot(request("GET", "/nix-cache-info", Body::empty()))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(cdn.requests.lock().unwrap().len(), 2);
    assert_eq!(
        app.oneshot(request("GET", "/readyz", Body::empty()))
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        cdn.requests.lock().unwrap().last().unwrap().1,
        "/bucket/team/cache/.readiness"
    );
    server.abort();
}

#[test]
fn file_and_memory_backends_keep_reading_the_supplied_store() {
    for backend in [Backend::File, Backend::Memory] {
        let mut config = config();
        config.backend = backend;
        let store: Arc<dyn ObjectStore> = Arc::new(InMemory::new());
        assert!(Arc::ptr_eq(
            &store,
            &config.read_storage(store.clone()).unwrap()
        ));
    }
}
