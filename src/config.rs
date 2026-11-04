//! Pipeline configuration shared by the CLI, executor, and Studio.

use crate::models::Action;
use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub steps: Vec<Step>,
    pub package: Option<Package>,
}

#[derive(Debug, Deserialize)]
pub struct Package {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct Step {
    pub name: String,
    pub command: Commands,
    pub env: Option<Vec<String>>,
    pub working_directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum Commands {
    One(String),
    Many(Vec<String>),
}

impl Commands {
    pub fn lines(&self) -> &[String] {
        match self {
            Self::One(s) => std::slice::from_ref(s),
            Self::Many(v) => v,
        }
    }
}

impl Config {
    pub fn parse(content: &str) -> Result<Self> {
        toml::from_str(content).context("Invalid fluentci.toml")
    }

    pub fn read(path: &Path) -> Result<Self> {
        Self::parse(
            &std::fs::read_to_string(path)
                .with_context(|| format!("Reading {}", path.display()))?,
        )
    }

    pub fn actions(&self) -> Result<Vec<Action>> {
        self.steps
            .iter()
            .map(|step| {
                let lines = step.command.lines();
                if lines.is_empty() {
                    bail!("Step {:?} has no commands", step.name);
                }
                let (plugin, commands) = if lines.len() == 1
                    && lines[0].starts_with("fluentci run ")
                {
                    let mut words =
                        shlex::split(&lines[0]).context("Unclosed quote in pipeline command")?;
                    words.drain(..2);
                    words.retain(|w| w != "--wasm" && w != "-w");
                    if words.is_empty() {
                        bail!("Missing plugin in step {:?}", step.name);
                    }
                    let plugin = words.remove(0);
                    (
                        plugin,
                        shlex::try_join(words.iter().map(String::as_str))?.to_string(),
                    )
                } else {
                    (
                        "shell".into(),
                        lines
                            .iter()
                            .map(|line| shlex::try_quote(line).map(|line| format!("bash {line}")))
                            .collect::<std::result::Result<Vec<_>, _>>()?
                            .join("\n"),
                    )
                };
                Ok(Action {
                    name: step.name.clone(),
                    plugin,
                    commands,
                    enabled: true,
                    use_wasm: true,
                    env: step.env.clone(),
                    working_directory: step.working_directory.clone(),
                    ..Action::default()
                })
            })
            .collect()
    }
}

pub fn find(root: &Path) -> Option<PathBuf> {
    [
        root.join("fluentci.toml"),
        root.join(".fluentci/fluentci.toml"),
    ]
    .into_iter()
    .find(|p| p.is_file())
}

pub fn environment(root: &Path) -> Result<Vec<(String, String)>> {
    let path = root.join(".fluentci/.env");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    dotenvy::from_path_iter(path)?
        .map(|v| v.map_err(Into::into))
        .collect()
}
