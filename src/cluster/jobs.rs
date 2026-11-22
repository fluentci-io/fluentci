use super::{ApiError, ApiState, ClusterCommand, Connection, HEARTBEAT, TTL, client, response};
use anyhow::{Context, Result, ensure};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use clap::Args;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Args)]
pub struct SubmitArgs {
    #[command(flatten)]
    pub connection: Connection,
    /// OCI image containing sh, git, and your build tools (including fluentci if used)
    #[arg(long)]
    pub image: String,
    /// Git repository cloned inside the fresh VM
    #[arg(long)]
    pub repo: String,
    /// Git commit or branch available in the clone; pin a commit for reproducibility
    #[arg(long = "ref", default_value = "HEAD")]
    pub revision: String,
    #[arg(long = "label")]
    pub labels: Vec<String>,
    #[arg(long, default_value_t = 1)]
    pub cpus: u16,
    /// VM memory in MiB
    #[arg(long, default_value_t = 1024)]
    pub memory: u32,
    /// Overall VM boot and execution timeout in seconds
    #[arg(long, default_value_t = 3600)]
    pub timeout: u32,
    /// Idempotency key: reuse this UUID to safely retry the same submission
    #[arg(long)]
    pub id: Option<Uuid>,
    /// Guest command, without shell interpolation
    #[arg(trailing_var_arg = true, allow_hyphen_values = true, default_values = ["fluentci", "run"])]
    pub command: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Spec {
    pub image: String,
    pub repo: String,
    pub revision: String,
    pub labels: Vec<String>,
    pub cpus: u16,
    pub memory: u32,
    pub timeout: u32,
    pub command: Vec<String>,
}

impl Spec {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.image.is_empty()
                && !self.image.starts_with('-')
                && self.image.len() <= 512
                && !self.image.bytes().any(|c| c.is_ascii_whitespace()),
            "Invalid OCI image"
        );
        let repo = reqwest::Url::parse(&self.repo).context("Use an HTTPS Git repository URL")?;
        ensure!(
            repo.scheme() == "https"
                && repo.host_str().is_some()
                && repo.username().is_empty()
                && repo.password().is_none(),
            "Use an HTTPS Git URL without embedded credentials"
        );
        ensure!(
            !self.revision.is_empty()
                && !self.revision.starts_with('-')
                && self.revision.len() <= 256
                && !self.revision.contains('\0'),
            "Invalid Git revision"
        );
        ensure!(
            self.cpus > 0
                && self.cpus <= 256
                && self.memory >= 128
                && self.memory <= 1_048_576
                && self.timeout > HEARTBEAT as u32
                && self.timeout <= 86400,
            "Invalid VM resources or timeout (11–86400 seconds)"
        );
        ensure!(
            !self.command.is_empty()
                && self.command.len() <= 256
                && self
                    .command
                    .iter()
                    .all(|arg| arg.len() <= 8192 && !arg.contains('\0'))
                && !self.command[0].is_empty(),
            "Invalid guest command"
        );
        ensure!(
            self.labels.len() <= 64
                && self
                    .labels
                    .iter()
                    .all(|label| !label.is_empty() && label.len() <= 128),
            "Invalid scheduling labels"
        );
        ensure!(
            serde_json::to_vec(self)?.len() <= 64 * 1024,
            "Job specification exceeds 64 KiB"
        );
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum Phase {
    Queued,
    Running {
        runner: Uuid,
        claim: Uuid,
        expires_at: i64,
    },
    Succeeded,
    Failed,
    Cancelled,
    Lost,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Job {
    pub id: Uuid,
    pub spec: Spec,
    #[serde(flatten)]
    pub phase: Phase,
    pub created_at: i64,
    pub updated_at: i64,
    pub result: Option<Outcome>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Outcome {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Submit {
    pub id: Uuid,
    pub spec: Spec,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ownership {
    pub runner: Uuid,
    pub claim: Uuid,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Complete {
    pub ownership: Ownership,
    pub result: Outcome,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claim {
    runner: Uuid,
}

pub(super) fn routes() -> Router<ApiState> {
    Router::new()
        .route("/v1/jobs", get(list).post(submit))
        .route("/v1/jobs/claim", post(claim))
        .route("/v1/jobs/{id}", get(inspect).delete(cancel))
        .route("/v1/jobs/{id}/renew", post(renew))
        .route("/v1/jobs/{id}/complete", post(complete))
}

fn bad(error: anyhow::Error) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, error)
}

fn conflict(message: &str) -> ApiError {
    ApiError(StatusCode::CONFLICT, anyhow::anyhow!("{message}"))
}

fn expire(mut job: Job) -> Job {
    if matches!(job.phase, Phase::Running { expires_at, .. } if expires_at <= chrono::Utc::now().timestamp())
    {
        job.phase = Phase::Lost;
    }
    job
}

async fn load(state: &ApiState, id: Uuid) -> Result<(Job, u64), ApiError> {
    state
        .store
        .records::<Job>("jobs")
        .await?
        .into_iter()
        .find(|(job, _)| job.id == id)
        .map(|(job, version)| (expire(job), version))
        .ok_or_else(|| {
            ApiError(
                StatusCode::NOT_FOUND,
                anyhow::anyhow!("Run {id} does not exist"),
            )
        })
}

async fn submit(
    State(state): State<ApiState>,
    Json(request): Json<Submit>,
) -> Result<Json<Job>, ApiError> {
    request.spec.validate().map_err(bad)?;
    let now = chrono::Utc::now().timestamp();
    let job = Job {
        id: request.id,
        spec: request.spec,
        phase: Phase::Queued,
        created_at: now,
        updated_at: now,
        result: None,
    };
    if state.store.cas("jobs", job.id, 0, &job).await? {
        return Ok(Json(job));
    }
    let (existing, _) = load(&state, job.id).await?;
    if existing.spec != job.spec {
        return Err(conflict(
            "This submission ID already belongs to a different job",
        ));
    }
    Ok(Json(existing))
}

async fn list(State(state): State<ApiState>) -> Result<Json<Vec<Job>>, ApiError> {
    let mut jobs: Vec<_> = state
        .store
        .records::<Job>("jobs")
        .await?
        .into_iter()
        .map(|(job, _)| expire(job))
        .collect();
    jobs.sort_by_key(|job| (job.created_at, job.id));
    Ok(Json(jobs))
}

async fn inspect(
    State(state): State<ApiState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Job>, ApiError> {
    Ok(Json(load(&state, id).await?.0))
}

async fn claim(
    State(state): State<ApiState>,
    Json(request): Json<Claim>,
) -> Result<Json<Option<Job>>, ApiError> {
    let nodes = state.store.nodes().await?;
    let node = nodes
        .iter()
        .find(|node| node.id == request.runner)
        .ok_or_else(|| conflict("Runner membership expired; rejoin first"))?;
    let mut jobs = state.store.records::<Job>("jobs").await?;
    let active = jobs.iter().filter(|(job, _)| matches!(job.phase, Phase::Running { runner, expires_at, .. } if runner == node.id && expires_at > chrono::Utc::now().timestamp())).count();
    if active >= usize::from(node.slots) {
        return Ok(Json(None));
    }
    jobs.sort_by_key(|(job, _)| (job.created_at, job.id));
    for (mut job, version) in jobs {
        if job.phase != Phase::Queued
            || job.spec.cpus as usize > node.cpus
            || job.spec.memory > node.max_memory
            || !job
                .spec
                .labels
                .iter()
                .all(|label| node.labels.contains(label))
        {
            continue;
        }
        let now = chrono::Utc::now().timestamp();
        job.phase = Phase::Running {
            runner: node.id,
            claim: Uuid::new_v4(),
            expires_at: now + TTL as i64,
        };
        job.updated_at = now;
        if state.store.cas("jobs", job.id, version, &job).await? {
            return Ok(Json(Some(job)));
        }
    }
    Ok(Json(None))
}

fn owns(job: &Job, ownership: &Ownership) -> Result<(), ApiError> {
    if matches!(job.phase, Phase::Running { runner, claim, expires_at } if runner == ownership.runner && claim == ownership.claim && expires_at > chrono::Utc::now().timestamp())
    {
        Ok(())
    } else {
        Err(conflict(
            "Run claim expired, was cancelled, or belongs to another runner",
        ))
    }
}

async fn renew(
    State(state): State<ApiState>,
    Path(id): Path<Uuid>,
    Json(ownership): Json<Ownership>,
) -> Result<Json<Job>, ApiError> {
    let (mut job, version) = load(&state, id).await?;
    owns(&job, &ownership)?;
    let now = chrono::Utc::now().timestamp();
    job.phase = Phase::Running {
        runner: ownership.runner,
        claim: ownership.claim,
        expires_at: now + TTL as i64,
    };
    job.updated_at = now;
    if !state.store.cas("jobs", id, version, &job).await? {
        return Err(conflict("Run changed; claim renewal rejected"));
    }
    Ok(Json(job))
}

async fn complete(
    State(state): State<ApiState>,
    Path(id): Path<Uuid>,
    Json(request): Json<Complete>,
) -> Result<Json<Job>, ApiError> {
    if request.result.stdout.len() > 65536
        || request.result.stderr.len() > 65536
        || request
            .result
            .error
            .as_ref()
            .is_some_and(|e| e.len() > 8192)
    {
        return Err(bad(anyhow::anyhow!("Result exceeds log limits")));
    }
    let (mut job, version) = load(&state, id).await?;
    owns(&job, &request.ownership)?;
    job.phase = if request.result.success {
        Phase::Succeeded
    } else {
        Phase::Failed
    };
    job.updated_at = chrono::Utc::now().timestamp();
    job.result = Some(request.result);
    if !state.store.cas("jobs", id, version, &job).await? {
        return Err(conflict("Run changed; completion rejected"));
    }
    Ok(Json(job))
}

async fn cancel(
    State(state): State<ApiState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Job>, ApiError> {
    let (mut job, version) = load(&state, id).await?;
    if !matches!(job.phase, Phase::Queued | Phase::Running { .. }) {
        return Ok(Json(job));
    }
    job.phase = Phase::Cancelled;
    job.updated_at = chrono::Utc::now().timestamp();
    if !state.store.cas("jobs", id, version, &job).await? {
        return Err(conflict("Run changed; retry cancellation"));
    }
    Ok(Json(job))
}

pub(super) async fn remove_node(
    State(state): State<ApiState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    state.store.remove(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn command(command: &ClusterCommand) -> Result<()> {
    let (connection, method, path, body) = match command {
        ClusterCommand::Submit(args) => {
            let spec = Spec {
                image: args.image.clone(),
                repo: args.repo.clone(),
                revision: args.revision.clone(),
                labels: args.labels.clone(),
                cpus: args.cpus,
                memory: args.memory,
                timeout: args.timeout,
                command: args.command.clone(),
            };
            spec.validate()?;
            let id = args.id.unwrap_or_else(Uuid::new_v4);
            eprintln!("Submission ID: {id} (reuse --id {id} to retry safely)");
            (
                &args.connection,
                reqwest::Method::POST,
                "/v1/jobs".to_owned(),
                Some(serde_json::to_value(Submit { id, spec })?),
            )
        }
        ClusterCommand::Runs { connection } => {
            (connection, reqwest::Method::GET, "/v1/jobs".into(), None)
        }
        ClusterCommand::Inspect { connection, id } => (
            connection,
            reqwest::Method::GET,
            format!("/v1/jobs/{id}"),
            None,
        ),
        ClusterCommand::Cancel { connection, id } => (
            connection,
            reqwest::Method::DELETE,
            format!("/v1/jobs/{id}"),
            None,
        ),
        _ => unreachable!("Other cluster commands dispatched before jobs"),
    };
    let mut request = connection.request(&client(10)?, method, &path)?;
    if let Some(body) = body {
        request = request.json(&body);
    }
    let value: serde_json::Value = response(request.send().await?).await?.json().await?;
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}

pub(super) async fn next(
    connection: &Connection,
    client: &reqwest::Client,
    runner: Uuid,
) -> Result<Option<Job>> {
    Ok(response(
        connection
            .request(client, reqwest::Method::POST, "/v1/jobs/claim")?
            .json(&Claim { runner })
            .send()
            .await?,
    )
    .await?
    .json()
    .await?)
}
