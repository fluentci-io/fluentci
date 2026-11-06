//! Pipeline configuration shared by the CLI, executor, and Studio.

use crate::models::Action;
use anyhow::{Context, Result, bail};
use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

#[derive(Debug, Deserialize, Serialize)]
pub struct Config {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub services: Vec<crate::services::definition::Definition>,
    #[serde(default)]
    pub steps: Vec<Step>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<Package>,
    #[serde(default)]
    pub modules: Vec<Module>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Module {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rev: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subdir: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub functions: Vec<crate::plugin_metadata::Function>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub sdk: Sdk,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build: Option<Vec<String>>,
}

impl Module {
    pub fn registry_package(&self) -> Option<&str> {
        self.package.as_deref().or_else(|| {
            (self.name.starts_with('@')
                && self.path.is_none()
                && self.url.is_none()
                && self.git.is_none())
            .then_some(self.name.as_str())
        })
    }
}

pub fn validate_subdir(path: &Path) -> Result<()> {
    anyhow::ensure!(
        !path.as_os_str().is_empty()
            && !path.to_string_lossy().contains(['\\', ':'])
            && path.components().all(|part| matches!(
                part,
                std::path::Component::Normal(_) | std::path::Component::CurDir
            )),
        "subdir must stay inside the repository (no absolute paths or ..)"
    );
    Ok(())
}

pub fn validate_logo(value: &str) -> Result<()> {
    let url = reqwest::Url::parse(value).context("Invalid module logo URL")?;
    anyhow::ensure!(
        value.len() <= 2048
            && matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none(),
        "Module logo must be an HTTP(S) picture URL without credentials (up to 2048 characters)"
    );
    Ok(())
}

pub fn validate_repository(value: &str) -> Result<()> {
    let url = reqwest::Url::parse(value).context("Invalid repository URL")?;
    anyhow::ensure!(
        matches!(url.scheme(), "http" | "https" | "ssh" | "git")
            && url.host_str().is_some()
            && url.password().is_none()
            && (url.username().is_empty() || url.scheme() == "ssh"),
        "Repository must be an HTTP(S), ssh://, or git:// URL without passwords"
    );
    Ok(())
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, ValueEnum, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Sdk {
    #[default]
    Rust,
    Purescript,
    Clojurescript,
    Elixir,
    Gleam,
    Typescript,
    Python,
    Rescript,
}

impl Sdk {
    pub fn name(self) -> &'static str {
        match self {
            Self::Rust => "rust",
            Self::Purescript => "purescript",
            Self::Clojurescript => "clojurescript",
            Self::Elixir => "elixir",
            Self::Gleam => "gleam",
            Self::Typescript => "typescript",
            Self::Python => "python",
            Self::Rescript => "rescript",
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Package {
    pub name: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Step {
    pub name: String,
    pub command: Commands,
    pub env: Option<Vec<String>>,
    pub working_directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub module: Option<String>,
    #[serde(default = "enabled", skip_serializing_if = "is_enabled")]
    pub enabled: bool,
    #[serde(
        default = "enabled",
        rename = "wasm",
        skip_serializing_if = "is_enabled"
    )]
    pub use_wasm: bool,
}

fn enabled() -> bool {
    true
}

fn is_enabled(value: &bool) -> bool {
    *value
}

#[derive(Debug, Clone, Deserialize, Serialize)]
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
        let config: Self = toml::from_str(content).context("Invalid fluentci.toml")?;
        let mut service_names = HashSet::new();
        for service in &config.services {
            service.validate()?;
            anyhow::ensure!(
                service_names.insert(&service.name),
                "Duplicate service name {:?}",
                service.name
            );
        }
        let mut names = HashSet::new();
        for module in &config.modules {
            if module.name.starts_with('@') {
                crate::registry::package_reference(&module.name)?;
            } else {
                validate_module_name(&module.name)?;
            }
            if let Some(git) = &module.git {
                validate_repository(git)?;
            }
            if let Some(rev) = &module.rev {
                anyhow::ensure!(
                    module.git.is_some()
                        && !rev.is_empty()
                        && !rev.starts_with('-')
                        && !rev.chars().any(char::is_whitespace)
                        && !rev.contains(':'),
                    "rev requires git and must be a Git branch, tag, or commit"
                );
            }
            if let Some(subdir) = &module.subdir {
                validate_subdir(subdir)?;
                anyhow::ensure!(
                    module.git.is_some() || module.repository.is_some(),
                    "subdir requires git or repository"
                );
            }
            if let Some(logo) = &module.logo {
                validate_logo(logo)?;
            }
            if let Some(repository) = &module.repository {
                validate_repository(repository)?;
            }
            if let Some(package) = module.registry_package() {
                anyhow::ensure!(
                    package.starts_with('@'),
                    "Registry module references must use @handle/module[@version]"
                );
                crate::registry::package_reference(package)?;
                anyhow::ensure!(
                    module.build.is_none() && module.artifact.is_none() && module.entry.is_none(),
                    "Registry modules cannot override build, entry, or artifact"
                );
            }
            anyhow::ensure!(
                (module.path.is_some() as u8
                    + module.url.is_some() as u8
                    + module.registry_package().is_some() as u8
                    + module.git.is_some() as u8)
                    == 1,
                "Module {:?} must specify exactly one of path, url, package, or git",
                module.name
            );
            if let Some(path) = &module.path {
                anyhow::ensure!(
                    !path.as_os_str().is_empty(),
                    "Module {:?} has an empty path",
                    module.name
                );
            }
            if let Some(url) = &module.url {
                validate_module_url(url)?;
                anyhow::ensure!(
                    module.build.is_none() && module.artifact.is_none(),
                    "URL module {:?} cannot specify build or artifact",
                    module.name
                );
            }
            anyhow::ensure!(
                names.insert(&module.name),
                "Duplicate module name {:?}",
                module.name
            );
            anyhow::ensure!(
                module.sdk != Sdk::Rust || module.artifact.is_none() || module.build.is_some(),
                "Rust module {:?} artifacts are resolved through Cargo; artifact overrides require a build command",
                module.name
            );
            if let Some(build) = &module.build {
                anyhow::ensure!(
                    !build.is_empty() && !build[0].trim().is_empty(),
                    "Module {:?} has an empty build command",
                    module.name
                );
            }
            let precompiled = module.registry_package().is_some()
                || module.url.is_some()
                || module.path.as_ref().is_some_and(|path| {
                    path.extension()
                        .is_some_and(|extension| extension == "wasm")
                });
            if module.sdk == Sdk::Elixir && module.build.is_none() && !precompiled {
                anyhow::ensure!(
                    module
                        .entry
                        .as_ref()
                        .is_some_and(|entry| !entry.trim().is_empty()),
                    "Elixir module {:?} requires entry = \"YourPluginModule\"",
                    module.name
                );
            }
        }
        Ok(config)
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
                if lines.is_empty() || lines.iter().all(|line| line.trim().is_empty()) {
                    bail!("Step {:?} has no commands", step.name);
                }
                let (plugin, commands) = if let Some(module) = &step.module {
                    (module.clone(), lines.join("\n"))
                } else if lines.len() == 1 && lines[0].starts_with("fluentci run ") {
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
                    enabled: step.enabled,
                    use_wasm: step.use_wasm,
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

pub fn validate_module_name(name: &str) -> Result<()> {
    anyhow::ensure!(
        !name.is_empty()
            && name != "shell"
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_')),
        "Invalid module name {name:?}: use letters, digits, hyphens, or underscores; 'shell' is reserved"
    );
    Ok(())
}

pub fn validate_module_url(value: &str) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(value).context("Invalid Wasm module URL")?;
    anyhow::ensure!(
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.path().ends_with(".wasm"),
        "Module URL must be an HTTP(S) URL ending in .wasm (query parameters are allowed)"
    );
    Ok(url)
}
