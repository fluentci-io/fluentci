//! Axum hosts Studio assets, GraphQL, and live execution events on one origin.

use crate::{
    db::Db,
    executor::{self, Events},
    models::*,
    modules, workflows,
    workspace::Workspace,
};
use anyhow::{Context as _, Result};
use async_graphql::{Context, EmptySubscription, ID, InputObject, Object, Schema, SimpleObject};
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
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    path::Path,
};
use tokio::sync::broadcast;

#[derive(RustEmbed)]
#[folder = "webui/dist/"]
struct Assets;
type Api = Schema<Query, Mutation, EmptySubscription>;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub events: Events,
    pub registry_url: String,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        Self {
            db,
            events: broadcast::channel(1024).0,
            registry_url: crate::registry::base_url(),
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

fn directory_suggestions(root: &Path) -> Result<Vec<String>> {
    let root = root
        .canonicalize()
        .context("Project directory is unavailable")?;
    anyhow::ensure!(root.is_dir(), "Project path is not a directory");
    let mut directories = vec![".".to_owned()];
    let mut pending = VecDeque::from([(root.clone(), 0)]);
    while let Some((directory, depth)) = pending.pop_front() {
        if depth >= 6 || directories.len() >= 500 {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            continue;
        };
        let mut children: Vec<_> = entries
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_type()
                    .is_ok_and(|kind| kind.is_dir() && !kind.is_symlink())
                    && !matches!(
                        entry.file_name().to_str(),
                        Some(".git" | "node_modules" | "target")
                    )
            })
            .map(|entry| entry.path())
            .collect();
        children.sort();
        for child in children {
            if directories.len() >= 500 {
                break;
            }
            directories.push(
                child
                    .strip_prefix(&root)?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
            pending.push_back((child, depth + 1));
        }
    }
    Ok(directories)
}

#[derive(SimpleObject)]
struct ModuleSuggestion {
    name: String,
    functions: Vec<String>,
    origin: String,
    logo: Option<String>,
    version: Option<String>,
    description: Option<String>,
}

pub struct Query;

#[Object]
impl Query {
    async fn current_account(
        &self,
    ) -> async_graphql::Result<Option<crate::account::AccountIdentity>> {
        Ok(crate::account::current()?)
    }

    async fn project_git(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
    ) -> async_graphql::Result<Option<crate::project_git::GitStatus>> {
        let project = ctx
            .data::<AppState>()?
            .db
            .project(&project_id)
            .await?
            .context("Project not found")?;
        Ok(crate::project_git::status(Path::new(&project.path)).await?)
    }

    async fn tangled_repositories(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<crate::tangled::TangledRepository>> {
        let Some(account) = crate::account::current()? else {
            return Ok(Vec::new());
        };
        Ok(ctx
            .data::<AppState>()?
            .db
            .tangled_repositories(&account.did)
            .await?)
    }

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
        workflow_id: Option<String>,
    ) -> async_graphql::Result<Vec<Action>> {
        let db = &ctx.data::<AppState>()?.db;
        let project = db
            .project(&project_id)
            .await?
            .context("Project not found")?;
        Ok(workflows::actions(
            db,
            &project,
            workflow_id.as_deref().unwrap_or(workflows::DEFAULT),
        )
        .await?)
    }

    async fn workflows(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
    ) -> async_graphql::Result<Vec<Workflow>> {
        let db = &ctx.data::<AppState>()?.db;
        let project = db
            .project(&project_id)
            .await?
            .context("Project not found")?;
        Ok(workflows::list(db, &project).await?)
    }

    async fn project_name_available(
        &self,
        ctx: &Context<'_>,
        name: String,
        project_id: ID,
    ) -> async_graphql::Result<bool> {
        Ok(!name.trim().is_empty()
            && ctx
                .data::<AppState>()?
                .db
                .project_name_available(&name, &project_id)
                .await?)
    }

    async fn project_directories(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
    ) -> async_graphql::Result<Vec<String>> {
        let project = ctx
            .data::<AppState>()?
            .db
            .project(&project_id)
            .await?
            .context("Project not found")?;
        Ok(
            tokio::task::spawn_blocking(move || directory_suggestions(Path::new(&project.path)))
                .await??,
        )
    }

    async fn action_suggestions(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
    ) -> async_graphql::Result<Vec<ModuleSuggestion>> {
        let db = &ctx.data::<AppState>()?.db;
        let project = db
            .project(&project_id)
            .await?
            .context("Project not found")?;
        let mut suggestions: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut logos = BTreeMap::new();
        let mut origins = BTreeMap::new();
        let root = Path::new(&project.path);
        let mut actions = db.actions(&project_id).await?;
        actions.extend(crate::detection::actions(root)?);
        for action in actions {
            let functions = suggestions.entry(action.plugin).or_default();
            for command in action.commands.lines() {
                if let Some(name) = command.split_whitespace().next() {
                    functions.insert(name.to_owned());
                }
            }
        }
        let workspace = Workspace::discover(root)?;
        for module in modules::discover(&workspace)? {
            // Missing or stale artifacts must not hide modules or saved suggestions.
            let functions = module.cached_functions().await.unwrap_or_default();
            logos.insert(module.name.clone(), module.definition.logo.clone());
            let origin = match module.definition.registry_package() {
                Some(reference)
                    if crate::registry::package_reference(reference).is_ok_and(|reference| {
                        reference.author == crate::registry::OFFICIAL_AUTHOR
                    }) =>
                {
                    "OFFICIAL"
                }
                Some(_) => "REGISTRY",
                None => "LOCAL",
            };
            origins.insert(module.name.clone(), origin);
            suggestions
                .entry(module.name)
                .or_default()
                .extend(functions);
        }
        Ok(suggestions
            .into_iter()
            .map(|(name, functions)| ModuleSuggestion {
                origin: origins
                    .get(&name)
                    .copied()
                    .unwrap_or(if name.starts_with('@') {
                        "REGISTRY"
                    } else if name == "shell" || name.contains("://") {
                        "LOCAL"
                    } else {
                        "OFFICIAL"
                    })
                    .into(),
                logo: logos.remove(&name).flatten(),
                name,
                functions: functions.into_iter().collect(),
                version: None,
                description: None,
            })
            .collect())
    }

    async fn registry_modules(
        &self,
        ctx: &Context<'_>,
        query: String,
    ) -> async_graphql::Result<Vec<ModuleSuggestion>> {
        let query = query.trim();
        if !(2..=512).contains(&query.len()) {
            return Err("Enter 2–512 characters to search the registry".into());
        }
        let registry_url = &ctx.data::<AppState>()?.registry_url;
        let mut packages = None;
        if query.starts_with('@')
            && query.contains('/')
            && let Ok(Ok(package)) = tokio::time::timeout(
                std::time::Duration::from_secs(5),
                crate::registry::resolve_at(query, registry_url),
            )
            .await
        {
            packages = Some(vec![package.metadata]);
        }
        let explicit_official = packages.is_some()
            && crate::registry::package_reference(query)
                .is_ok_and(|reference| reference.author == crate::registry::OFFICIAL_AUTHOR);
        let packages = match packages {
            Some(packages) => packages,
            None => crate::registry::search_packages_at(query, 10, registry_url).await?,
        };
        let official_author = crate::registry::official_author_at(registry_url)
            .await
            .unwrap_or_default();
        Ok(packages
            .into_iter()
            .filter_map(|package| {
                let author = package.author?.trim_start_matches('@').to_owned();
                let name = package.name?;
                let version = package.version?;
                if author.is_empty() || name.is_empty() {
                    return None;
                }
                let official = official_author.as_deref() == Some(author.as_str())
                    || author == crate::registry::OFFICIAL_AUTHOR
                    || explicit_official;
                Some(ModuleSuggestion {
                    name: if official {
                        format!("{name}@v{}", version.trim_start_matches('v'))
                    } else {
                        format!("@{author}/{name}@v{}", version.trim_start_matches('v'))
                    },
                    functions: package
                        .functions
                        .unwrap_or_default()
                        .into_iter()
                        .map(|function| function.name)
                        .collect(),
                    origin: if official { "OFFICIAL" } else { "REGISTRY" }.into(),
                    logo: package
                        .logo
                        .filter(|url| crate::config::validate_logo(url).is_ok()),
                    version: Some(version),
                    description: package.description,
                })
            })
            .collect())
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
        workflow_id: Option<String>,
    ) -> async_graphql::Result<Vec<Run>> {
        let offset = cursor
            .as_ref()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0)
            + skip.unwrap_or(0).max(0) as usize;
        let mut runs = page(
            ctx.data::<AppState>()?
                .db
                .workflow_runs(&project_id, workflow_id.as_deref())
                .await?,
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

    async fn count_runs(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        workflow_id: Option<String>,
    ) -> async_graphql::Result<i32> {
        Ok(ctx
            .data::<AppState>()?
            .db
            .workflow_runs(&project_id, workflow_id.as_deref())
            .await?
            .len() as i32)
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
        workflow_id: Option<String>,
    ) -> async_graphql::Result<String> {
        let db = &ctx.data::<AppState>()?.db;
        let project = db
            .project(&project_id)
            .await?
            .context("Project not found")?;
        let definition = workflows::definition(
            db,
            &project,
            workflow_id.as_deref().unwrap_or(workflows::DEFAULT),
        )
        .await?;
        Ok(crate::export::generate_workflow(&plateform, &definition)?)
    }
}

#[derive(InputObject)]
struct NewWorkflowInput {
    events: Option<WorkflowEvents>,
    id: String,
    name: String,
    description: Option<String>,
    copy_from: Option<String>,
}

#[derive(InputObject)]
struct WorkflowUpdateInput {
    events: Option<WorkflowEvents>,
    name: Option<String>,
    description: Option<String>,
    enabled: Option<bool>,
    env: Option<Vec<String>>,
    expected_revision: Option<String>,
}

pub struct Mutation;

#[Object]
impl Mutation {
    async fn pull_project(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
    ) -> async_graphql::Result<crate::project_git::GitStatus> {
        update_project_git(ctx, &project_id, None).await
    }

    async fn switch_project_branch(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        branch: String,
    ) -> async_graphql::Result<crate::project_git::GitStatus> {
        update_project_git(ctx, &project_id, Some(&branch)).await
    }

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
        project_name: Option<String>,
        description: Option<String>,
        tags: Option<String>,
    ) -> async_graphql::Result<Option<Project>> {
        let db = &ctx.data::<AppState>()?.db;
        let Some(mut p) = db.project(&id).await? else {
            return Ok(None);
        };
        let renaming = project_name.is_some();
        if let Some(name) = project_name {
            let name = name.trim();
            if name.is_empty() {
                return Err(async_graphql::Error::new("Enter a project name."));
            }
            p.name = name.to_owned();
        }
        if let Some(name) = name {
            if name.trim().is_empty() {
                return Err(async_graphql::Error::new("Enter a display name."));
            }
            p.display_name = Some(name);
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
        if renaming {
            db.save_project_with_unique_name(&p).await?;
        } else {
            db.save_project(&p).await?;
        }
        executor::publish(Some(&ctx.data::<AppState>()?.events), "project", &p);
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
        actions: Vec<Action>,
        workflow_id: Option<String>,
        expected_revision: Option<String>,
    ) -> async_graphql::Result<Vec<Action>> {
        let s = ctx.data::<AppState>()?;
        let project =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let key = workflow_id.as_deref().unwrap_or(workflows::DEFAULT);
        let workflow = workflows::update(
            &s.db,
            &project,
            key,
            workflows::Update {
                actions: Some(actions.clone()),
                expected_revision,
                ..Default::default()
            },
        )
        .await?;
        executor::publish(Some(&s.events), "workflow", &workflow);
        Ok(actions)
    }

    async fn create_workflow(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        input: NewWorkflowInput,
    ) -> async_graphql::Result<Workflow> {
        let s = ctx.data::<AppState>()?;
        let project =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let workflow = workflows::create_with_events(
            &s.db,
            &project,
            &input.id,
            &input.name,
            input.description,
            input.copy_from.as_deref(),
            input.events,
        )
        .await?;
        executor::publish(Some(&s.events), "workflow", &workflow);
        Ok(workflow)
    }

    async fn update_workflow(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        workflow_id: String,
        input: WorkflowUpdateInput,
    ) -> async_graphql::Result<Workflow> {
        let s = ctx.data::<AppState>()?;
        let project =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let workflow = workflows::update(
            &s.db,
            &project,
            &workflow_id,
            workflows::Update {
                events: input.events,
                name: input.name,
                description: input.description,
                enabled: input.enabled,
                env: input.env,
                expected_revision: input.expected_revision,
                ..Default::default()
            },
        )
        .await?;
        executor::publish(Some(&s.events), "workflow", &workflow);
        Ok(workflow)
    }

    async fn delete_workflow(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        workflow_id: String,
        expected_revision: Option<String>,
    ) -> async_graphql::Result<bool> {
        let s = ctx.data::<AppState>()?;
        let project =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let deleted = workflows::delete(&project, &workflow_id, expected_revision).await?;
        executor::publish(
            Some(&s.events),
            "workflow",
            serde_json::json!({"id": workflow_id}),
        );
        Ok(deleted)
    }

    async fn run_pipeline(
        &self,
        ctx: &Context<'_>,
        project_id: ID,
        wait: Option<bool>,
        job_name: Option<String>,
        workflow_id: Option<String>,
    ) -> async_graphql::Result<Run> {
        let s = ctx.data::<AppState>()?.clone();
        let project =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let run = executor::prepare_workflow(
            &s.db,
            &project,
            workflow_id.as_deref().unwrap_or(workflows::DEFAULT),
            job_name.as_deref(),
        )
        .await?;
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
        workflow_id: Option<String>,
    ) -> async_graphql::Result<Job> {
        let s = ctx.data::<AppState>()?.clone();
        let p =
            s.db.project(&project_id)
                .await?
                .context("Project not found")?;
        let run = executor::prepare_workflow(
            &s.db,
            &p,
            workflow_id.as_deref().unwrap_or(workflows::DEFAULT),
            Some(&job_name),
        )
        .await?;
        let run = executor::execute_prepared(s.db, p, run, Some(s.events)).await?;
        Ok(run
            .jobs
            .into_iter()
            .find(|job| job.name == job_name)
            .context("Job missing from run")?)
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

async fn update_project_git(
    ctx: &Context<'_>,
    project_id: &str,
    branch: Option<&str>,
) -> async_graphql::Result<crate::project_git::GitStatus> {
    let state = ctx.data::<AppState>()?;
    let project = state
        .db
        .project(project_id)
        .await?
        .context("Project not found")?;
    if project.archived.unwrap_or(false) {
        return Err("Project is archived".into());
    }
    let runs = state.db.workflow_runs(project_id, None).await?;
    if runs
        .iter()
        .any(|run| matches!(run.status.as_deref(), Some("PENDING" | "RUNNING")))
    {
        return Err(
            "Wait for active project runs to finish before changing its Git working tree".into(),
        );
    }
    let status = crate::project_git::update(Path::new(&project.path), branch).await?;
    executor::publish(
        Some(&state.events),
        "project-git",
        serde_json::json!({"projectId":project_id}),
    );
    Ok(status)
}
