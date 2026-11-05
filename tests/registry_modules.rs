use anyhow::Result;
use axum::{
    Json, Router,
    extract::{Query, State},
    routing::get,
};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::process::Command;

#[derive(Clone)]
struct Registry {
    url: String,
    wasm: Vec<u8>,
    generation: Arc<AtomicUsize>,
    requests: Arc<AtomicUsize>,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn direct_registry_runs_install_updates_and_frozen_locks_work_without_initial_config()
-> Result<()> {
    let root = tempfile::tempdir()?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let state = Registry {
        url: format!("http://{}", listener.local_addr()?),
        wasm: wat::parse_str("(module (func (export \"hello\") (result i32) i32.const 0))")?,
        generation: Arc::new(AtomicUsize::new(0)),
        requests: Arc::new(AtomicUsize::new(0)),
    };
    let router = Router::new().route("/xrpc/io.fluentci.registry.getPackage", get(|State(state): State<Registry>, Query(query): Query<HashMap<String,String>>| async move {
        assert_eq!(query.get("author").map(String::as_str), Some("alice.example"));
        state.requests.fetch_add(1, Ordering::SeqCst);
        let version = query.get("version").cloned().unwrap_or_else(|| if state.generation.load(Ordering::SeqCst) == 0 { "1.0.0".into() } else { "1.1.0".into() });
        Json(serde_json::json!({"package":{"name":"cache","version":version,"author":"did:plc:alice","url":format!("{}/plugin.wasm",state.url),"sha256":sha256::digest(&state.wasm)}}))
    })).route("/plugin.wasm", get(|State(state): State<Registry>| async move { state.wasm })).with_state(state.clone());
    let server = tokio::spawn(async move { axum::serve(listener, router).await });
    let invoke = |arguments: &[&str]| {
        let mut command = Command::new(env!("CARGO_BIN_EXE_fluentci"));
        command
            .args(["--check-update=false", "--database"])
            .arg(root.path().join("state.sqlite"))
            .args(arguments)
            .current_dir(root.path())
            .env_remove("FLUENTCI_PROJECT_ID")
            .env("FLUENTCI_REGISTRY_URL", &state.url)
            .env("FLUENTCI_PACKAGE_CACHE", root.path().join("cache"));
        command
    };
    let first = invoke(&["@alice.example/cache", "hello"]).output().await?;
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    assert!(!root.path().join("fluentci.toml").exists());
    let lock_path = root.path().join("fluentci.lock");
    let initial = std::fs::read(&lock_path)?;
    state.generation.store(1, Ordering::SeqCst);
    let frozen = invoke(&[
        "run",
        "--frozen-lockfile",
        "@alice.example/cache@latest",
        "hello",
    ])
    .output()
    .await?;
    assert!(
        frozen.status.success(),
        "{}",
        String::from_utf8_lossy(&frozen.stderr)
    );
    assert_eq!(std::fs::read(&lock_path)?, initial);
    assert_eq!(state.requests.load(Ordering::SeqCst), 1);
    std::fs::write(
        root.path().join("fluentci.toml"),
        "[[modules]]\nname='cache'\npackage='@alice.example/cache'\n",
    )?;
    assert!(
        !invoke(&["install", "--frozen-lockfile"])
            .output()
            .await?
            .status
            .success()
    );
    assert!(invoke(&["install"]).output().await?.status.success());
    assert!(
        invoke(&["run", "--frozen-lockfile", "cache", "hello"])
            .output()
            .await?
            .status
            .success()
    );
    assert!(
        invoke(&["update", "cache"])
            .output()
            .await?
            .status
            .success()
    );
    let lock: Value = serde_json::from_slice(&std::fs::read(&lock_path)?)?;
    assert_eq!(
        lock["packages"]["@alice.example/cache@latest"]["version"],
        "1.1.0"
    );
    let direct_url = invoke(&[&format!("{}/plugin.wasm", state.url), "hello"])
        .output()
        .await?;
    assert!(
        direct_url.status.success(),
        "{}",
        String::from_utf8_lossy(&direct_url.stderr)
    );
    server.abort();
    Ok(())
}
