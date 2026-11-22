//! Shared-state coordination for horizontally scalable, fresh-VM runners.

use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use clap::{Args, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, path::Path, sync::Arc, time::Duration};
use uuid::Uuid;

mod jobs;
mod runner;
mod store;
#[cfg(test)]
mod tests;

const TTL: u64 = 30;
const HEARTBEAT: u64 = 10;

#[derive(Debug, Subcommand)]
pub enum ClusterCommand {
    /// Start a stateless API for a pool of VM runners
    Serve(ServeArgs),
    /// Join the runner pool; boot a fresh bsdkrun VM for each claimed job
    Join(JoinArgs),
    /// Submit work to the VM runner pool
    Submit(jobs::SubmitArgs),
    /// List durable run records
    Runs {
        #[command(flatten)]
        connection: Connection,
    },
    /// Inspect a run, including its result and bounded logs
    Inspect {
        id: Uuid,
        #[command(flatten)]
        connection: Connection,
    },
    /// Cancel queued or running work (the runner tears down its VM)
    Cancel {
        id: Uuid,
        #[command(flatten)]
        connection: Connection,
    },
    /// List live runners
    #[command(name = "runners", alias = "nodes")]
    Nodes {
        #[command(flatten)]
        connection: Connection,
        #[arg(long)]
        json: bool,
    },
    /// Check authentication, state availability, and runner capacity
    Doctor {
        #[command(flatten)]
        connection: Connection,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum Backend {
    Etcd,
    Consul,
}

#[derive(Debug, Args)]
pub struct ServeArgs {
    #[arg(
        long,
        env = "FLUENTCI_CLUSTER_LISTEN",
        default_value = "127.0.0.1:6080"
    )]
    pub listen: SocketAddr,
    #[arg(long, env = "FLUENTCI_CLUSTER_STATE", value_enum)]
    pub state: Backend,
    /// etcd v3 HTTP gateway or Consul HTTP API origin
    #[arg(long, env = "FLUENTCI_CLUSTER_STATE_URL")]
    pub state_url: String,
    #[arg(long, env = "FLUENTCI_CLUSTER_NAME", default_value = "default")]
    pub name: String,
    #[arg(long, env = "FLUENTCI_CLUSTER_STATE_TOKEN", hide_env_values = true)]
    pub state_token: Option<String>,
    /// Bearer token; generated and displayed at startup when unset
    #[arg(long, env = "FLUENTCI_CLUSTER_TOKEN", hide_env_values = true)]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Args)]
pub struct Auth {
    /// Shared operator secret; prefer the environment variable
    #[arg(long, env = "FLUENTCI_CLUSTER_TOKEN", hide_env_values = true)]
    pub token: String,
}

#[derive(Debug, Clone, Args)]
pub struct Connection {
    #[arg(
        long,
        env = "FLUENTCI_CLUSTER_API",
        default_value = "http://127.0.0.1:6080"
    )]
    pub api: String,
    #[command(flatten)]
    pub auth: Auth,
}

#[derive(Debug, Clone, Args)]
pub struct JoinArgs {
    #[command(flatten)]
    pub connection: Connection,
    #[arg(long, default_value = "runner")]
    pub name: String,
    /// Maximum simultaneous VMs on this host
    #[arg(long, default_value_t = 1, value_parser = clap::value_parser!(u16).range(1..=256))]
    pub slots: u16,
    /// Scheduling labels, e.g. linux-arm64 or trusted
    #[arg(long = "label")]
    pub labels: Vec<String>,
    /// Maximum memory per VM in MiB
    #[arg(long, default_value_t = 4096, value_parser = clap::value_parser!(u32).range(128..))]
    pub max_memory: u32,
    /// bsdkrun executable; use an absolute path when supervised
    #[arg(long, default_value = "bsdkrun")]
    pub bsdkrun: String,
    /// Exclusive local runner directory, including crash-recovery VM journals
    #[arg(long, default_value = ".fluentci/runner")]
    pub work_dir: std::path::PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: Uuid,
    pub name: String,
    pub platform: String,
    pub arch: String,
    pub cpus: usize,
    pub max_memory: u32,
    pub slots: u16,
    pub labels: Vec<String>,
    pub version: String,
    pub expires_at: i64,
}

#[derive(Clone)]
struct ApiState {
    store: store::Store,
}

struct ApiError(StatusCode, anyhow::Error);

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self(StatusCode::SERVICE_UNAVAILABLE, error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::warn!(error = %self.1, "Cluster request failed");
        let message = if self.0 == StatusCode::SERVICE_UNAVAILABLE {
            "Cluster state unavailable; inspect API logs".to_owned()
        } else {
            self.1.to_string()
        };
        (self.0, Json(serde_json::json!({"error": message}))).into_response()
    }
}

fn origin(value: &str) -> Result<String> {
    let url = reqwest::Url::parse(value).context("Expected an HTTP(S) origin")?;
    ensure!(
        matches!(url.scheme(), "http" | "https") && url.host_str().is_some(),
        "Expected an HTTP(S) origin"
    );
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none()
            && url.path() == "/",
        "Use an origin without credentials, path, query, or fragment"
    );
    ensure!(
        !matches!(url.host_str(), Some("0.0.0.0" | "[::]")),
        "Use a reachable address, not a wildcard listener"
    );
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

fn client(timeout: u64) -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(timeout))
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}

fn validate_token(token: &str) -> Result<()> {
    crate::server_auth::validate(token, "FLUENTCI_CLUSTER_TOKEN")
}

fn router(state: ApiState, token: Arc<str>) -> Router {
    let app = jobs::routes()
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(nodes))
        .route("/v1/nodes", get(nodes).post(register))
        .route("/v1/nodes/{id}", axum::routing::delete(jobs::remove_node))
        .with_state(state);
    crate::server_auth::protect(app, token)
}

async fn nodes(State(state): State<ApiState>) -> Result<Json<Vec<Node>>, ApiError> {
    Ok(Json(state.store.nodes().await?))
}

async fn register(
    State(state): State<ApiState>,
    Json(mut node): Json<Node>,
) -> Result<Json<Node>, ApiError> {
    if node.name.is_empty()
        || node.name.len() > 128
        || node.cpus == 0
        || node.slots == 0
        || node.slots > 256
        || node.max_memory < 128
        || node.labels.len() > 64
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            anyhow::anyhow!("Invalid runner metadata"),
        ));
    }
    node.expires_at = chrono::Utc::now().timestamp() + TTL as i64;
    state.store.put(&node).await?;
    Ok(Json(node))
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("Install SIGTERM handler");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}

async fn response(response: reqwest::Response) -> Result<reqwest::Response> {
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        anyhow::bail!("Cluster API {status}: {detail}");
    }
    Ok(response)
}

impl Connection {
    fn request(
        &self,
        client: &reqwest::Client,
        method: reqwest::Method,
        path: &str,
    ) -> Result<reqwest::RequestBuilder> {
        validate_token(&self.auth.token)?;
        Ok(client
            .request(method, format!("{}{path}", origin(&self.api)?))
            .bearer_auth(&self.auth.token))
    }
}

pub async fn execute(command: &ClusterCommand, _database: &Path) -> Result<()> {
    match command {
        ClusterCommand::Serve(args) => {
            let token =
                crate::server_auth::resolve(args.token.as_deref(), "FLUENTCI_CLUSTER_TOKEN")?;
            let store = store::Store::new(args)?;
            store
                .nodes()
                .await
                .context("Cannot reach cluster state; check --state-url and backend ACLs")?;
            let listener = tokio::net::TcpListener::bind(args.listen).await?;
            println!(
                "Cluster {} API listening on {}",
                args.name,
                listener.local_addr()?
            );
            println!("Cluster API token: {token}");
            println!("Configure runners: export FLUENTCI_CLUSTER_TOKEN='{token}'");
            println!(
                "Join a runner: fluentci cluster join --api <API_ORIGIN> --label <CAPABILITY>"
            );
            axum::serve(listener, router(ApiState { store }, token.into()))
                .with_graceful_shutdown(shutdown())
                .await?;
        }
        ClusterCommand::Join(args) => runner::join(args).await?,
        ClusterCommand::Nodes { connection, .. } | ClusterCommand::Doctor { connection } => {
            let nodes: Vec<Node> = response(
                connection
                    .request(&client(10)?, reqwest::Method::GET, "/v1/nodes")?
                    .send()
                    .await?,
            )
            .await?
            .json()
            .await?;
            if matches!(command, ClusterCommand::Doctor { .. }) {
                println!(
                    "API authentication: OK\nState backend: OK\nLive runners: {}\nVM slots: {}",
                    nodes.len(),
                    nodes.iter().map(|n| u64::from(n.slots)).sum::<u64>()
                );
                ensure!(
                    !nodes.is_empty(),
                    "No live runners. Run fluentci cluster join --api {}",
                    connection.api
                );
            } else if matches!(command, ClusterCommand::Nodes { json: true, .. }) {
                println!("{}", serde_json::to_string_pretty(&nodes)?);
            } else {
                println!(
                    "ID                                   NAME             SLOTS PLATFORM       LABELS"
                );
                for node in &nodes {
                    println!(
                        "{} {:16} {:5} {}/{} {}",
                        node.id,
                        node.name,
                        node.slots,
                        node.platform,
                        node.arch,
                        node.labels.join(",")
                    );
                }
                println!("{} live runner(s)", nodes.len());
            }
        }
        _ => jobs::command(command).await?,
    }
    Ok(())
}
