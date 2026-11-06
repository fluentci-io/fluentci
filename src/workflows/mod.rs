//! Version-controlled workflow definitions, shared by Studio and the CLI.

mod storage;

pub use crate::models::Workflow;
use crate::{
    config::{Commands, Config, Step},
    db::Db,
    models::{Action, Project, WorkflowEvents},
};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path};

pub const DEFAULT: &str = "default";

pub fn default_id() -> String {
    DEFAULT.into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    #[serde(default, rename = "on")]
    pub events: WorkflowEvents,
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub env: Vec<String>,
    #[serde(default)]
    pub steps: Vec<Step>,
}

fn enabled() -> bool {
    true
}

pub fn validate_id(id: &str) -> Result<()> {
    ensure!(
        !id.is_empty()
            && id.len() <= 64
            && id.starts_with(|c: char| c.is_ascii_lowercase())
            && id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_')),
        "Workflow ID must start with a lowercase letter and contain only lowercase letters, digits, hyphens or underscores (up to 64 characters)"
    );
    Ok(())
}

pub fn validate_actions(actions: &[Action]) -> Result<()> {
    let mut names = HashSet::new();
    for action in actions {
        ensure!(
            !action.name.trim().is_empty() && names.insert(action.name.trim()),
            "Workflow steps need unique, non-empty names"
        );
        ensure!(
            !action.plugin.trim().is_empty() && !action.commands.trim().is_empty(),
            "Step {:?} needs a module and command",
            action.name
        );
        crate::pipeline::action_commands(action)?;
        validate_env(action.env.as_deref().unwrap_or_default())?;
    }
    Ok(())
}

fn validate_env(values: &[String]) -> Result<()> {
    for value in values {
        let (key, _) = value
            .split_once('=')
            .context("Environment entries must use KEY=value")?;
        ensure!(
            !value.contains('\0')
                && key.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')
                && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'),
            "Invalid environment variable name"
        );
    }
    Ok(())
}

impl Definition {
    pub fn from_actions(
        id: String,
        name: String,
        description: Option<String>,
        actions: &[Action],
    ) -> Self {
        Self {
            events: WorkflowEvents::default(),
            id,
            name,
            description,
            enabled: true,
            env: vec![],
            steps: actions
                .iter()
                .map(|a| Step {
                    name: a.name.clone(),
                    command: Commands::One(a.commands.clone()),
                    module: Some(a.plugin.clone()),
                    enabled: a.enabled,
                    use_wasm: a.use_wasm,
                    env: a.env.clone(),
                    working_directory: a.working_directory.clone(),
                })
                .collect(),
        }
    }

    pub fn validate(&self) -> Result<()> {
        self.events.validate()?;
        validate_id(&self.id)?;
        ensure!(
            !self.name.trim().is_empty() && self.name.len() <= 128 && !self.name.contains('\0'),
            "Workflow name must contain 1–128 characters"
        );
        ensure!(
            self.description
                .as_ref()
                .is_none_or(|d| d.len() <= 2048 && !d.contains('\0')),
            "Workflow description must contain at most 2048 characters"
        );
        validate_env(&self.env)?;
        validate_actions(&self.actions()?)
    }

    pub fn actions(&self) -> Result<Vec<Action>> {
        Config {
            steps: self.steps.clone(),
            services: vec![],
            modules: vec![],
            package: None,
        }
        .actions()
    }

    pub fn run_actions(&self) -> Result<Vec<Action>> {
        let mut actions = self.actions()?;
        for action in &mut actions {
            let mut env = self.env.clone();
            env.extend(action.env.take().unwrap_or_default());
            action.env = (!env.is_empty()).then_some(env);
        }
        Ok(actions)
    }

    fn metadata(&self, path: Option<String>, revision: Option<String>) -> Workflow {
        Workflow {
            events: self.events.clone(),
            id: self.id.clone(),
            name: self.name.clone(),
            description: self.description.clone(),
            enabled: self.enabled,
            env: self.env.clone(),
            path,
            revision,
            step_count: self.steps.len().min(i32::MAX as usize) as i32,
            legacy: false,
        }
    }
}

async fn legacy(db: &Db, project: &Project) -> Result<Definition> {
    let mut actions = db.actions(&project.id).await?;
    if actions.is_empty() && Path::new(&project.path).is_dir() {
        actions = crate::detection::actions(Path::new(&project.path))?;
    }
    Ok(Definition::from_actions(
        DEFAULT.into(),
        "Default".into(),
        None,
        &actions,
    ))
}

pub async fn list(db: &Db, project: &Project) -> Result<Vec<Workflow>> {
    let root = project.path.clone();
    let mut items = tokio::task::spawn_blocking(move || storage::list(Path::new(&root))).await??;
    if !items.iter().any(|w| w.id == DEFAULT) {
        let mut item = legacy(db, project).await?.metadata(None, None);
        item.legacy = true;
        items.insert(0, item);
    }
    Ok(items)
}

pub async fn definition(db: &Db, project: &Project, id: &str) -> Result<Definition> {
    validate_id(id)?;
    let root = project.path.clone();
    let key = id.to_owned();
    match tokio::task::spawn_blocking(move || storage::read(Path::new(&root), &key)).await?? {
        Some(value) => Ok(value),
        None if id == DEFAULT => legacy(db, project).await,
        None => anyhow::bail!("Workflow {id:?} not found"),
    }
}

/// Return a version-controlled definition without consulting legacy project actions.
pub fn file_definition(root: &Path, id: &str) -> Result<Option<Definition>> {
    validate_id(id)?;
    storage::read(root, id)
}

pub async fn actions(db: &Db, project: &Project, id: &str) -> Result<Vec<Action>> {
    definition(db, project, id).await?.actions()
}

pub async fn create(
    db: &Db,
    project: &Project,
    id: &str,
    name: &str,
    description: Option<String>,
    copy_from: Option<&str>,
) -> Result<Workflow> {
    create_with_events(db, project, id, name, description, copy_from, None).await
}

#[allow(clippy::too_many_arguments)]
pub async fn create_with_events(
    db: &Db,
    project: &Project,
    id: &str,
    name: &str,
    description: Option<String>,
    copy_from: Option<&str>,
    events: Option<WorkflowEvents>,
) -> Result<Workflow> {
    ensure!(!project.archived.unwrap_or(false), "Project is archived");
    ensure!(id != DEFAULT, "The default workflow already exists");
    let mut value = if let Some(source) = copy_from {
        definition(db, project, source).await?
    } else {
        Definition::from_actions(id.into(), name.into(), description.clone(), &[])
    };
    value.id = id.into();
    value.name = name.trim().into();
    value.description = description;
    value.enabled = true;
    if let Some(events) = events {
        value.events = events;
    }
    let root = project.path.clone();
    tokio::task::spawn_blocking(move || storage::write(Path::new(&root), value, true, None)).await?
}

#[derive(Default)]
pub struct Update {
    pub events: Option<WorkflowEvents>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
    pub env: Option<Vec<String>>,
    pub actions: Option<Vec<Action>>,
    pub expected_revision: Option<String>,
}

pub async fn update(db: &Db, project: &Project, id: &str, update: Update) -> Result<Workflow> {
    ensure!(!project.archived.unwrap_or(false), "Project is archived");
    let fallback = definition(db, project, id).await?;
    // Storage reloads under its writer lock, so concurrent metadata and action
    // updates preserve fields they do not edit. Legacy defaults materialize here.
    fallback.validate()?;
    let root = project.path.clone();
    tokio::task::spawn_blocking(move || storage::update(Path::new(&root), fallback, update)).await?
}

pub async fn delete(project: &Project, id: &str, revision: Option<String>) -> Result<bool> {
    ensure!(!project.archived.unwrap_or(false), "Project is archived");
    ensure!(id != DEFAULT, "The default workflow cannot be deleted");
    validate_id(id)?;
    let root = project.path.clone();
    let key = id.to_owned();
    tokio::task::spawn_blocking(move || {
        storage::delete(Path::new(&root), &key, revision.as_deref())
    })
    .await?
}
