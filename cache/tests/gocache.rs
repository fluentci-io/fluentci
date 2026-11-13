use base64::{Engine, engine::general_purpose::STANDARD};
use clap::Parser;
use fluentci_cache::{
    Config,
    gocache::{GoConfig, serve},
    router,
};
use object_store::memory::InMemory;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Parser)]
struct Options {
    #[command(flatten)]
    config: Config,
}

async fn server() -> (String, tokio::task::JoinHandle<()>) {
    let config =
        Options::parse_from(["test", "--backend", "memory", "--token", "test-token"]).config;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = router(config, Arc::new(InMemory::new())).unwrap();
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (url, task)
}

async fn response(reader: &mut BufReader<tokio::io::ReadHalf<tokio::io::DuplexStream>>) -> Value {
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    serde_json::from_str(&line).unwrap()
}

#[tokio::test]
async fn go_protocol_round_trip_empty_large_miss_and_close() {
    let (url, server) = server().await;
    let (client, helper) = tokio::io::duplex(128 * 1024);
    let (read, mut write) = tokio::io::split(client);
    let (input, output) = tokio::io::split(helper);
    let helper = tokio::spawn(serve(
        GoConfig {
            url,
            token: Some("test-token".into()),
            directory: None,
            max_object: 16 * 1024 * 1024,
        },
        BufReader::new(input),
        output,
    ));
    let mut read = BufReader::new(read);
    assert_eq!(
        response(&mut read).await["KnownCommands"],
        json!(["get", "put", "close"])
    );
    write
        .write_all(
            format!(
                "{}\n",
                json!({"ID": 1, "Command": "get", "ActionID": STANDARD.encode([9; 32])})
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    assert_eq!(response(&mut read).await, json!({"ID": 1, "Miss": true}));
    let mut paths = Vec::new();
    for (index, payload) in [
        Vec::new(),
        b"go artifact".to_vec(),
        vec![17; 9 * 1024 * 1024 + 1],
    ]
    .into_iter()
    .enumerate()
    {
        let action = STANDARD.encode([index as u8; 32]);
        let output = STANDARD.encode(Sha256::digest(&payload));
        let put = json!({"ID": 2, "Command": "put", "ActionID": action, "OutputID": output, "BodySize": payload.len()});
        write
            .write_all(format!("{put}\n\n").as_bytes())
            .await
            .unwrap();
        if !payload.is_empty() {
            write
                .write_all(format!("\"{}\"\n", STANDARD.encode(&payload)).as_bytes())
                .await
                .unwrap();
        }
        let put = response(&mut read).await;
        assert!(put.get("Err").is_none(), "{put}");
        let path = put["DiskPath"].as_str().unwrap().to_owned();
        assert_eq!(tokio::fs::read(&path).await.unwrap(), payload);
        paths.push(path);
        write
            .write_all(
                format!(
                    "{}\n",
                    json!({"ID": 3, "Command": "get", "ActionID": action})
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        let get = response(&mut read).await;
        assert!(get.get("Err").is_none(), "{get}");
        assert_eq!(get["OutputID"], output);
        assert_eq!(get["Size"], payload.len());
        let path = get["DiskPath"].as_str().unwrap().to_owned();
        assert_eq!(tokio::fs::read(&path).await.unwrap(), payload);
        paths.push(path);
    }
    for path in &paths {
        assert!(std::path::Path::new(path).exists());
    }
    write
        .write_all(b"{\"ID\":4,\"Command\":\"close\"}\n")
        .await
        .unwrap();
    assert_eq!(response(&mut read).await, json!({"ID": 4}));
    helper.await.unwrap().unwrap();
    for path in &paths {
        assert!(!std::path::Path::new(path).exists());
    }
    server.abort();
}

#[tokio::test]
async fn corrupt_remote_go_output_is_rejected() {
    let (url, server) = server().await;
    let action = STANDARD.encode([1; 32]);
    let path = format!("{url}/gocache/{}", hex::encode([1; 32]));
    reqwest::Client::new()
        .put(path)
        .bearer_auth("test-token")
        .body(vec![0; 40])
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let (client, helper) = tokio::io::duplex(4096);
    let (read, mut write) = tokio::io::split(client);
    let (input, output) = tokio::io::split(helper);
    let helper = tokio::spawn(serve(
        GoConfig {
            url,
            token: None,
            directory: None,
            max_object: 4096,
        },
        BufReader::new(input),
        output,
    ));
    let mut read = BufReader::new(read);
    response(&mut read).await;
    write
        .write_all(
            format!(
                "{}\n",
                json!({"ID": 1, "Command": "get", "ActionID": action})
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    assert!(
        response(&mut read).await["Err"]
            .as_str()
            .unwrap()
            .contains("digest mismatch")
    );
    write.shutdown().await.unwrap();
    helper.await.unwrap().unwrap();
    server.abort();
}

#[tokio::test]
#[ignore = "requires Go 1.24+ installed; see README"]
async fn real_go_client_reuses_remote_cache_across_empty_local_caches() {
    let (url, server) = server().await;
    let project = tempfile::tempdir().unwrap();
    std::fs::write(
        project.path().join("go.mod"),
        "module example.test/cache-smoke\n\ngo 1.24\n",
    )
    .unwrap();
    std::fs::write(
        project.path().join("main.go"),
        "package main\nfunc main() { println(\"cache smoke\") }\n",
    )
    .unwrap();
    for iteration in 0..2 {
        let local = project.path().join(format!("local-{iteration}"));
        let output = tokio::process::Command::new("go")
            .args(["build", "-o", "output", "."])
            .current_dir(project.path())
            .env("GOCACHE", &local)
            .env("GOTOOLCHAIN", "local")
            .env(
                "GOCACHEPROG",
                format!("{} gocache", env!("CARGO_BIN_EXE_fluentci-cache")),
            )
            .env("FLUENTCI_CACHE_URL", &url)
            .env("FLUENTCI_CACHE_TOKEN", "test-token")
            .output()
            .await
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let metrics = reqwest::Client::new()
        .get(format!("{url}/metrics"))
        .bearer_auth("test-token")
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    let hits: u64 = metrics
        .lines()
        .find_map(|line| line.strip_prefix("fluentci_cache_hits_total "))
        .unwrap()
        .parse()
        .unwrap();
    assert!(
        hits > 0,
        "second build should hit the remote cache: {metrics}"
    );
    server.abort();
}
