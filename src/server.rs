//! Axum hosts Studio assets, GraphQL, and live execution events on one origin.

use crate::{
    db::Db,
    executor::{self, Events},
    models::*,
};
use anyhow::{Context as _, Result};
use async_graphql::{Context, EmptySubscription, ID, InputObject, Object, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    Router,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{StatusCode, Uri, header},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use rust_embed::RustEmbed;
use tokio::sync::broadcast;

#[derive(RustEmbed)]
#[folder = "webui/dist/"]
struct Assets;
type Api = Schema<Query, Mutation, EmptySubscription>;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub events: Events,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        Self {
            db,
            events: broadcast::channel(1024).0,
        }
    }
}

#[derive(Default, InputObject)]
struct ProjectFilters {
    org: Option<String>,
    user: Option<String>,
    archived: Option<bool>,
    tags: Option<Vec<String>>,
}

fn page<T>(
    mut items: Vec<T>,
    skip: Option<i32>,
    limit: Option<i32>,
    cursor: Option<String>,
    reverse: Option<bool>,
) -> Vec<T> {
    if reverse.unwrap_or(false) {
        items.reverse();
    }
    let offset = cursor.and_then(|v| v.parse::<usize>().ok()).unwrap_or(0)
        + skip.unwrap_or(0).max(0) as usize;
    items
        .into_iter()
        .skip(offset)
        .take(limit.unwrap_or(100).clamp(0, 1000) as usize)
        .collect()
}

pub struct Query;

#[Object]
impl Query {
    async fn search(
        &self,
        ctx: &Context<'_>,
        query: String,
        project_id: Option<ID>,
        limit: Option<i32>,
    ) -> async_graphql::Result<Vec<SearchResult>> {
        Ok(ctx
            .data::<AppState>()?
            .db
            .search(
                &query,
                project_id.as_ref().map(|id| id.as_str()),
                limit.unwrap_or(30),
            )
            .await?)
    }

    #[allow(clippy::too_many_arguments)]
    async fn projects(
        &self,
        ctx: &Context<'_>,
        skip: Option<i32>,
        limit: Option<i32>,
        cursor: Option<String>,
        reverse: Option<bool>,
        filters: Option<ProjectFilters>,
    ) -> async_graphql::Result<Vec<Project>> {
        let s = ctx.data::<AppState>()?;
        let mut items = s.db.projects().await?;
        if let Some(f) = filters {
            items.retain(|p| {
                f.archived.is_none_or(|a| p.archived.unwrap_or(false) == a)
                    && f.tags.as_ref().is_none_or(|tags| {
                        tags.iter()
                            .all(|t| p.tags.as_ref().is_some_and(|v| v.contains(t)))
                    })
            });
        }
        let offset = cursor
            .as_ref()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0)
            + skip.unwrap_or(0).max(0) as usize;
        let mut items = page(items, skip, limit, cursor, reverse);
        let next = (offset + items.len()).to_string();
        for p in &mut items {
            p.cursor = Some(next.clone());
        }
        Ok(items)
    }

    async fn project(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Project>> {
        Ok(ctx.data::<AppState>()?.db.project(&id).await?)
    }

    async fn count_projects(&self, ctx: &Context<'_>) -> async_graphql::Result<i32> {
        Ok(ctx.data::<AppState>()?.db.projects().await?.len() as i32)
    }

    async fn actions(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
    ) -> async_graphql::Result<Vec<Action>> {
        Ok(ctx.data::<AppState>()?.db.actions(&project_id).await?)
    }

    async fn get_run(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Run>> {
        Ok(ctx.data::<AppState>()?.db.run(&id).await?)
    }

    #[allow(clippy::too_many_arguments)]
    async fn get_runs(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        skip: Option<i32>,
        limit: Option<i32>,
        cursor: Option<String>,
        reverse: Option<bool>,
    ) -> async_graphql::Result<Vec<Run>> {
        let offset = cursor
            .as_ref()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0)
            + skip.unwrap_or(0).max(0) as usize;
        let mut runs = page(
            ctx.data::<AppState>()?.db.runs(&project_id).await?,
            skip,
            limit,
            cursor,
            Some(reverse.unwrap_or(true)),
        );
        let next = (offset + runs.len()).to_string();
        for run in &mut runs {
            run.cursor = Some(next.clone());
        }
        Ok(runs)
    }

    async fn count_runs(&self, ctx: &Context<'_>, project_id: ID) -> async_graphql::Result<i32> {
        Ok(ctx.data::<AppState>()?.db.runs(&project_id).await?.len() as i32)
    }

    async fn jobs(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Job>> {
        Ok(ctx.data::<AppState>()?.db.jobs(None).await?)
    }

    async fn job(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Job>> {
        Ok(ctx
            .data::<AppState>()?
            .db
            .jobs(None)
            .await?
            .into_iter()
            .find(|j| j.id == id.as_str()))
    }

    async fn logs(
        &self,
        ctx: &Context<'_>,
        job_id: Option<ID>,
        project_id: Option<ID>,
    ) -> async_graphql::Result<Vec<Log>> {
        Ok(ctx
            .data::<AppState>()?
            .db
            .logs(
                job_id.as_ref().map(|v| v.as_str()),
                project_id.as_ref().map(|v| v.as_str()),
            )
            .await?)
    }

    async fn log(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<Log>> {
        Ok(ctx.data::<AppState>()?.db.logs(None, None).await?.pop())
    }

    // Preserve the original API's spelling for existing Studio clients.
    async fn export_actions(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        plateform: String,
    ) -> async_graphql::Result<String> {
        Ok(crate::export::generate(
            &plateform,
            &ctx.data::<AppState>()?.db.actions(&project_id).await?,
        )?)
    }
}

pub struct Mutation;

#[Object]
impl Mutation {
    async fn create_project(
        &self,
        ctx: &Context<'_>,
        from_repository: Option<String>,
    ) -> async_graphql::Result<Project> {
        let s = ctx.data::<AppState>()?;
        let mut project = Project::new("empty".into());
        if let Some(repo) = from_repository {
            let dir = dirs::home_dir()
                .context("Home directory unavailable")?
                .join(".fluentci/workspace")
                .join(&project.name);
            tokio::fs::create_dir_all(dir.parent().context("Missing workspace parent")?).await?;
            crate::process::execute(
                "git",
                ["clone", "--", &repo, &dir.to_string_lossy()],
                std::path::Path::new("."),
            )
            .await?;
            project.path = dir.to_string_lossy().into();
            project.repository_url = Some(repo);
        }
        s.db.save_project(&project).await?;
        let root = std::path::Path::new(&project.path);
        if root.is_dir() {
            s.db.save_actions(&project.id, &crate::detection::actions(root)?)
                .await?;
        }
        executor::publish(Some(&s.events), "project", &project);
        Ok(project)
    }

    async fn update_project(
        &self,
        ctx: &Context<'_>,
        id: ID,
        name: Option<String>,
        description: Option<String>,
        tags: Option<String>,
    ) -> async_graphql::Result<Option<Project>> {
        let db = &ctx.data::<AppState>()?.db;
        let Some(mut p) = db.project(&id).await? else {
            return Ok(None);
        };
        if name.is_some() {
            p.display_name = name;
        }
        if description.is_some() {
            p.description = description;
        }
        if let Some(tags) = tags {
            p.tags = Some(
                tags.split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(Into::into)
                    .collect(),
            );
        }
        db.save_project(&p).await?;
        Ok(Some(p))
    }

    async fn delete_project(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<bool> {
        Ok(ctx.data::<AppState>()?.db.delete_project(&id).await?)
    }

    async fn archive_project(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<Option<Project>> {
        archive(ctx, &id, true).await
    }

    async fn unarchive_project(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<Option<Project>> {
        archive(ctx, &id, false).await
    }

    async fn save_actions(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        mut actions: Vec<Action>,
    ) -> async_graphql::Result<Vec<Action>> {
        for a in &mut actions {
            a.id = Some(id());
        }
        ctx.data::<AppState>()?
            .db
            .save_actions(&project_id, &actions)
            .await?;
        Ok(actions)
    }

    async fn run_pipeline(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        wait: Option<bool>,
    ) -> async_graphql::Result<Run> {
        let s = ctx.data::<AppState>()?.clone();
        let project =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let run = executor::prepare(&s.db, &project).await?;
        if wait.unwrap_or(false) {
            return Ok(executor::execute_prepared(s.db, project, run, Some(s.events)).await?);
        }
        let pending = run.clone();
        tokio::spawn(async move {
            if let Err(error) = executor::execute_prepared(s.db, project, run, Some(s.events)).await
            {
                tracing::error!(%error,"Pipeline failed");
            }
        });
        Ok(pending)
    }

    async fn cancel_run(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Run> {
        let s = ctx.data::<AppState>()?;
        let mut run = s.db.run(&id).await?.context("Run not found")?;
        run.status = Some("CANCELLED".into());
        s.db.save_run(&run).await?;
        executor::publish(Some(&s.events), "run", &run);
        Ok(run)
    }

    async fn run_job(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        job_name: String,
    ) -> async_graphql::Result<Job> {
        let s = ctx.data::<AppState>()?.clone();
        let p =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        Ok(executor::execute_job(s.db, p, &job_name, Some(s.events)).await?)
    }
}

async fn archive(
    ctx: &Context<'_>,
    id: &str,
    value: bool,
) -> async_graphql::Result<Option<Project>> {
    let db = &ctx.data::<AppState>()?.db;
    let Some(mut p) = db.project(id).await? else {
        return Ok(None);
    };
    p.archived = Some(value);
    db.save_project(&p).await?;
    Ok(Some(p))
}

pub fn schema(state: AppState) -> Api {
    Schema::build(Query, Mutation, EmptySubscription)
        .data(state)
        .finish()
}

pub fn router(state: AppState, studio: bool) -> Router {
    let api = schema(state.clone());
    let mut app = Router::new()
        .route(
            "/graphql",
            get(graphiql).post(move |req: GraphQLRequest| {
                let api = api.clone();
                async move { GraphQLResponse::from(api.execute(req.into_inner()).await) }
            }),
        )
        .route("/graphiql", get(graphiql))
        .route("/ws", get(socket));
    if studio {
        app = app.fallback(get(studio_or_socket));
    } else {
        app = app.route("/", get(socket));
    }
    app.with_state(state)
}

async fn graphiql() -> Html<String> {
    Html(
        async_graphql::http::GraphiQLSource::build()
            .endpoint("/graphql")
            .finish(),
    )
}

async fn socket(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |ws| events(ws, state.events))
}

async fn events(mut ws: WebSocket, tx: Events) {
    let mut rx = tx.subscribe();
    loop {
        tokio::select! {
            message=ws.recv()=>match message {
                Some(Ok(Message::Text(_)))=>{if ws.send(Message::Text(serde_json::json!({"channel":"heartbeat","data":{}}).to_string().into())).await.is_err(){break;}},
                Some(Ok(Message::Ping(v)))=>{if ws.send(Message::Pong(v)).await.is_err(){break;}},
                Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,
                _=>{},
            },
            event=rx.recv()=>match event {
                Ok(event)=>if ws.send(Message::Text(event.into())).await.is_err(){break;},
                Err(broadcast::error::RecvError::Lagged(_))=>continue,
                Err(_)=>break,
            }
        }
    }
}

async fn studio_or_socket(
    ws: std::result::Result<
        WebSocketUpgrade,
        axum::extract::ws::rejection::WebSocketUpgradeRejection,
    >,
    State(state): State<AppState>,
    uri: Uri,
) -> Response {
    if let Ok(ws) = ws {
        return ws.on_upgrade(move |ws| events(ws, state.events));
    }
    asset(uri.path())
}

pub fn asset(path: &str) -> Response {
    let path = path.trim_start_matches('/');
    let file = if path.is_empty() || !path.rsplit('/').next().unwrap_or("").contains('.') {
        "index.html"
    } else {
        path
    };
    match Assets::get(file) {
        Some(asset) => (
            [(
                header::CONTENT_TYPE,
                mime_guess::from_path(file)
                    .first_or_octet_stream()
                    .to_string(),
            )],
            asset.data.into_owned(),
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "Asset not found").into_response(),
    }
}

pub async fn serve(db: Db, port: u16, studio: bool) -> Result<()> {
    let state = AppState::new(db);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let port = listener.local_addr()?.port();
    println!(
        "FluentCI {}: http://localhost:{port}{}",
        if studio { "Studio" } else { "API" },
        if studio { "" } else { "/graphql" }
    );
    if studio
        && std::env::var_os("FLUENTCI_NO_OPEN").is_none()
        && let Err(error) = open::that(format!("http://localhost:{port}"))
    {
        tracing::warn!(%error,"Could not open browser");
    }
    axum::serve(listener, router(state, studio))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
