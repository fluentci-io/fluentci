use super::*;
use axum::{
    body::Body,
    extract::{Path as AxumPath, Request},
    routing::post,
};
use clap::{CommandFactory, Parser};
use jobs::{Complete, Job, Outcome, Ownership, Phase, Spec, Submit};
use std::sync::Mutex;
use tower::ServiceExt;

const TOKEN: &str = "cluster-tests-shared-secret-32-characters";

struct Running(tokio::task::JoinHandle<()>);

impl Drop for Running {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn start(app: Router) -> (String, Running) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (url, Running(task))
}

fn args(backend: Backend, url: String) -> ServeArgs {
    ServeArgs {
        listen: "127.0.0.1:0".parse().unwrap(),
        state: backend,
        state_url: url,
        name: format!("test-{}", Uuid::new_v4()),
        state_token: None,
        token: Some(TOKEN.into()),
    }
}

fn spec() -> Spec {
    Spec {
        image: "alpine:3.20".into(),
        repo: "https://example.com/repo.git".into(),
        revision: "HEAD".into(),
        labels: vec!["test".into()],
        cpus: 1,
        memory: 512,
        timeout: 60,
        command: vec!["sh".into(), "-c".into(), "echo test".into()],
    }
}

fn node() -> Node {
    Node {
        id: Uuid::new_v4(),
        name: "test-runner".into(),
        platform: "linux".into(),
        arch: "aarch64".into(),
        cpus: 2,
        max_memory: 1024,
        slots: 1,
        labels: vec!["test".into()],
        version: "test".into(),
        expires_at: 0,
    }
}

#[test]
fn cluster_cli_and_inputs_are_validated() {
    crate::cli::Cli::command().debug_assert();
    assert!(
        crate::cli::Cli::try_parse_from([
            "fluentci",
            "cluster",
            "serve",
            "--state",
            "etcd",
            "--state-url",
            "http://localhost:2379",
        ])
        .is_ok()
    );
    for command in [
        vec![
            "serve",
            "--state",
            "etcd",
            "--state-url",
            "http://localhost:2379",
        ],
        vec!["join", "--slots", "2", "--label", "linux"],
        vec!["nodes", "--json"],
        vec!["doctor"],
        vec![
            "submit",
            "--image",
            "alpine",
            "--repo",
            "https://example.com/repo.git",
        ],
    ] {
        let values = [vec!["fluentci", "cluster"], command, vec!["--token", TOKEN]].concat();
        assert!(crate::cli::Cli::try_parse_from(values).is_ok());
    }
    for invalid in [
        "file:///etc/passwd",
        "http://user:pass@host",
        "http://host/path",
        "http://host?token=secret",
        "http://0.0.0.0:80",
        "http://[::]:80",
    ] {
        assert!(origin(invalid).is_err(), "Accepted {invalid}");
    }
    assert!(validate_token("short").is_err());
    assert!(validate_token(TOKEN).is_ok());
    spec().validate().unwrap();
    let mut invalid = spec();
    invalid.repo = "file:///host/repo".into();
    assert!(invalid.validate().is_err());
    invalid = spec();
    invalid.revision = "--upload-pack=evil".into();
    assert!(invalid.validate().is_err());
    invalid = spec();
    invalid.image = "--mount=/host".into();
    assert!(invalid.validate().is_err());
    let mut config = args(Backend::Etcd, "http://localhost:2379".into());
    config.name = "../../other".into();
    assert!(store::Store::new(&config).is_err());
}

#[tokio::test]
async fn auth_precedes_backend_access() {
    let store = store::Store::new(&args(Backend::Etcd, "http://127.0.0.1:1".into())).unwrap();
    let app = router(ApiState { store }, TOKEN.into());
    let response = app
        .oneshot(
            Request::builder()
                .uri("/v1/jobs")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[ignore = "requires FLUENTCI_TEST_ETCD_URL"]
async fn etcd_cluster_lifecycle() {
    backend_suite(
        Backend::Etcd,
        std::env::var("FLUENTCI_TEST_ETCD_URL").unwrap(),
    )
    .await;
}

#[tokio::test]
#[ignore = "requires FLUENTCI_TEST_CONSUL_URL"]
async fn consul_cluster_lifecycle() {
    backend_suite(
        Backend::Consul,
        std::env::var("FLUENTCI_TEST_CONSUL_URL").unwrap(),
    )
    .await;
}

async fn backend_suite(backend: Backend, url: String) {
    let config = args(backend, url);
    let store = store::Store::new(&config).unwrap();
    let other = store::Store::new(&config).unwrap();
    let (api, _api) = start(router(
        ApiState {
            store: store.clone(),
        },
        TOKEN.into(),
    ))
    .await;
    let (replica, _replica) = start(router(
        ApiState {
            store: other.clone(),
        },
        TOKEN.into(),
    ))
    .await;
    let client = client(10).unwrap();
    let nodes = [node(), node()];
    for node in &nodes {
        client
            .post(format!("{api}/v1/nodes"))
            .bearer_auth(TOKEN)
            .json(node)
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap();
    }
    let submission = Submit {
        id: Uuid::new_v4(),
        spec: spec(),
    };
    for endpoint in [&api, &replica] {
        client
            .post(format!("{endpoint}/v1/jobs"))
            .bearer_auth(TOKEN)
            .json(&submission)
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap();
    }
    assert_eq!(store.records::<Job>("jobs").await.unwrap().len(), 1);
    let mut conflicting = submission.clone();
    conflicting.spec.memory = 768;
    assert_eq!(
        client
            .post(format!("{api}/v1/jobs"))
            .bearer_auth(TOKEN)
            .json(&conflicting)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    // Independent API replicas race for one job. Exactly one CAS may win.
    let mut races = tokio::task::JoinSet::new();
    for index in 0..16 {
        let endpoint = if index % 2 == 0 {
            api.clone()
        } else {
            replica.clone()
        };
        let client = client.clone();
        let runner = nodes[index % 2].id;
        races.spawn(async move {
            client
                .post(format!("{endpoint}/v1/jobs/claim"))
                .bearer_auth(TOKEN)
                .json(&serde_json::json!({"runner": runner}))
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .json::<Option<Job>>()
                .await
                .unwrap()
        });
    }
    let mut claimed = Vec::new();
    while let Some(result) = races.join_next().await {
        if let Some(job) = result.unwrap() {
            claimed.push(job);
        }
    }
    assert_eq!(claimed.len(), 1);
    let job = claimed.pop().unwrap();
    let Phase::Running { runner, claim, .. } = job.phase else {
        panic!("Expected running")
    };
    let ownership = Ownership { runner, claim };
    let invalid = Ownership {
        runner,
        claim: Uuid::new_v4(),
    };
    assert_eq!(
        client
            .post(format!("{replica}/v1/jobs/{}/renew", job.id))
            .bearer_auth(TOKEN)
            .json(&invalid)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
    client
        .post(format!("{replica}/v1/jobs/{}/renew", job.id))
        .bearer_auth(TOKEN)
        .json(&ownership)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let outcome = Outcome {
        success: true,
        exit_code: Some(0),
        stdout: "test".into(),
        stderr: String::new(),
        error: None,
    };
    client
        .post(format!("{api}/v1/jobs/{}/complete", job.id))
        .bearer_auth(TOKEN)
        .json(&Complete {
            ownership,
            result: outcome,
        })
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let finished: Job = client
        .get(format!("{replica}/v1/jobs/{}", job.id))
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(finished.phase, Phase::Succeeded);
    // Expired claims are lost and never silently requeued.
    let lost = Job {
        id: Uuid::new_v4(),
        spec: spec(),
        phase: Phase::Running {
            runner,
            claim,
            expires_at: chrono::Utc::now().timestamp() - 1,
        },
        created_at: 0,
        updated_at: 0,
        result: None,
    };
    assert!(store.cas("jobs", lost.id, 0, &lost).await.unwrap());
    let result: Job = client
        .get(format!("{api}/v1/jobs/{}", lost.id))
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result.phase, Phase::Lost);
    // A queued job can be cancelled from another API replica.
    let cancelled = Submit {
        id: Uuid::new_v4(),
        spec: spec(),
    };
    client
        .post(format!("{api}/v1/jobs"))
        .bearer_auth(TOKEN)
        .json(&cancelled)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let result: Job = client
        .delete(format!("{replica}/v1/jobs/{}", cancelled.id))
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result.phase, Phase::Cancelled);
    for index in 0..4 {
        tokio::time::sleep(Duration::from_secs(9)).await;
        let endpoint = if index % 2 == 0 { &replica } else { &api };
        for node in &nodes {
            client
                .post(format!("{endpoint}/v1/nodes"))
                .bearer_auth(TOKEN)
                .json(node)
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap();
        }
        assert_eq!(other.nodes().await.unwrap().len(), 2);
    }
    for node in nodes {
        other.remove(node.id).await.unwrap();
    }
    assert!(store.nodes().await.unwrap().is_empty());
    assert_eq!(store.records::<Job>("jobs").await.unwrap().len(), 3);
    assert!(
        store::Store::new(&args(backend, config.state_url))
            .unwrap()
            .records::<Job>("jobs")
            .await
            .unwrap()
            .is_empty()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn vm_execution_cleans_up_before_publishing_result() {
    use std::os::unix::fs::PermissionsExt;

    let directory = tempfile::tempdir().unwrap();
    let binary = directory.path().join("fake-bsdkrun");
    let marker = directory.path().join("vm-present");
    let script = format!(
        "#!/bin/sh\ncase \"$1\" in\nlinux) touch '{}' ;;\nexec) if [ \"$3\" != true ]; then printf 'guest stdout'; printf 'guest stderr' >&2; fi ;;\nrm) rm '{}' ;;\nps) echo '[]' ;;\nesac\n",
        marker.display(),
        marker.display()
    );
    std::fs::write(&binary, script).unwrap();
    std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
    let results = Arc::new(Mutex::new(Vec::<Complete>::new()));
    let captured = results.clone();
    let present = marker.clone();
    let app = Router::new().route(
        "/v1/jobs/{id}/complete",
        post(
            move |AxumPath(_): AxumPath<Uuid>, Json(result): Json<Complete>| {
                let captured = captured.clone();
                let present = present.clone();
                async move {
                    assert!(!present.exists(), "Published result before VM cleanup");
                    captured.lock().unwrap().push(result);
                    Json(serde_json::json!({}))
                }
            },
        ),
    );
    let (api, _api) = start(app).await;
    let args = JoinArgs {
        connection: Connection {
            api,
            auth: Auth {
                token: TOKEN.into(),
            },
        },
        name: "test".into(),
        slots: 1,
        labels: vec![],
        max_memory: 1024,
        bsdkrun: binary.to_string_lossy().into(),
        work_dir: directory.path().to_owned(),
    };
    let job = Job {
        id: Uuid::new_v4(),
        spec: spec(),
        phase: Phase::Running {
            runner: Uuid::new_v4(),
            claim: Uuid::new_v4(),
            expires_at: chrono::Utc::now().timestamp() + TTL as i64,
        },
        created_at: 0,
        updated_at: 0,
        result: None,
    };
    let (_stop, stopped) = tokio::sync::watch::channel(false);
    runner::run_job(Arc::new(args), job, stopped).await.unwrap();
    let results = results.lock().unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].result.success);
    assert_eq!(results[0].result.stdout, "guest stdout");
    assert!(!marker.exists());
    assert!(
        !std::fs::read_dir(directory.path()).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("vm-"))
    );
}
