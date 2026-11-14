//! Portable service definitions shared by TOML, Procfiles, and the JSON API.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Program {
    Shell(String),
    #[default]
    Empty,
    Exec(Vec<String>),
}

impl Program {
    pub fn argv(&self) -> Vec<String> {
        match self {
            Self::Shell(command) => vec!["sh".into(), "-c".into(), command.clone()],
            Self::Exec(arguments) => arguments.clone(),
            Self::Empty => vec![],
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    #[default]
    Host,
    Nix,
    Devbox,
    Devenv,
    Pkgx,
    Docker,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Restart {
    #[default]
    Never,
    OnFailure,
    Always,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum Probe {
    Exec {
        command: Vec<String>,
    },
    Tcp {
        address: String,
    },
    Http {
        url: String,
        #[serde(default = "http_ok")]
        status: u16,
    },
}

fn http_ok() -> u16 {
    200
}
fn startup_timeout() -> u64 {
    30_000
}
fn stop_timeout() -> u64 {
    5_000
}
fn restart_limit() -> u32 {
    3
}
fn backoff() -> u64 {
    250
}
fn log_size() -> u64 {
    5 * 1024 * 1024
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Definition {
    pub name: String,
    #[serde(default)]
    pub command: Program,
    #[serde(default)]
    pub backend: Backend,
    #[serde(default)]
    pub working_directory: Option<PathBuf>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default)]
    pub flake: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub volumes: Vec<String>,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub setup: Option<Program>,
    #[serde(default)]
    pub readiness: Option<Probe>,
    #[serde(default)]
    pub health: Option<Probe>,
    #[serde(default)]
    pub restart: Restart,
    #[serde(default = "restart_limit")]
    pub max_restarts: u32,
    #[serde(default = "backoff")]
    pub restart_backoff_ms: u64,
    #[serde(default = "startup_timeout")]
    pub startup_timeout_ms: u64,
    #[serde(default = "stop_timeout")]
    pub stop_timeout_ms: u64,
    #[serde(default = "log_size")]
    pub log_max_bytes: u64,
}

impl Definition {
    pub fn validate(&self) -> Result<()> {
        anyhow::ensure!(
            !self.name.is_empty()
                && self.name.len() <= 64
                && self
                    .name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')),
            "Invalid service name {:?}",
            self.name
        );
        let args = self.command.argv();
        anyhow::ensure!(
            self.backend == Backend::Docker || (!args.is_empty() && !args[0].trim().is_empty()),
            "Service {:?} needs a command",
            self.name
        );
        anyhow::ensure!(
            !matches!(&self.command, Program::Shell(command) if command.trim().is_empty()),
            "Empty service command"
        );
        anyhow::ensure!(
            (100..=600_000).contains(&self.startup_timeout_ms)
                && (100..=120_000).contains(&self.stop_timeout_ms)
                && self.restart_backoff_ms >= 50
                && self.max_restarts <= 100
                && self.log_max_bytes >= 4096,
            "Invalid service timeout, restart, or log limits"
        );
        if self.backend == Backend::Docker {
            anyhow::ensure!(
                self.image
                    .as_ref()
                    .is_some_and(|value| !value.is_empty() && !value.starts_with('-')),
                "Docker services require an image"
            );
            anyhow::ensure!(
                self.setup.is_none(),
                "Docker setup belongs in the image entrypoint or a dependency"
            );
            for port in &self.ports {
                let parts: Vec<_> = port.split(':').collect();
                anyhow::ensure!(
                    parts.len() <= 2
                        && parts
                            .iter()
                            .all(|part| part.parse::<u16>().is_ok_and(|port| port > 0)),
                    "ports must be container_port or host_port:container_port"
                );
            }
        } else {
            anyhow::ensure!(
                self.image.is_none() && self.ports.is_empty() && self.volumes.is_empty(),
                "image, ports, and volumes require Docker"
            );
        }
        for (key, value) in &self.env {
            anyhow::ensure!(
                !key.is_empty() && !key.contains(['=', '\0']) && !value.contains('\0'),
                "Invalid environment entry"
            );
        }
        for probe in [self.readiness.as_ref(), self.health.as_ref()]
            .into_iter()
            .flatten()
        {
            match probe {
                Probe::Exec { command } => anyhow::ensure!(
                    !command.is_empty() && !command[0].trim().is_empty(),
                    "Empty probe command"
                ),
                Probe::Tcp { address } => {
                    anyhow::ensure!(!address.is_empty(), "Empty TCP probe address")
                }
                Probe::Http { url, status } => {
                    // Port placeholders expand to host:port after Docker binds.
                    // Validate their URL shape using an address stand-in first.
                    let mut validation_url = url.clone();
                    if self.backend == Backend::Docker {
                        for port in &self.ports {
                            let container_port = port.rsplit(':').next().unwrap_or(port);
                            validation_url = validation_url
                                .replace(&format!("${{port:{container_port}}}"), "127.0.0.1:1");
                        }
                    }
                    let url = reqwest::Url::parse(&validation_url)?;
                    anyhow::ensure!(
                        matches!(url.scheme(), "http" | "https") && (100..=599).contains(status),
                        "Invalid HTTP probe"
                    );
                }
            }
        }
        Ok(())
    }

    pub fn argv(&self, container: &str, override_command: Option<Vec<String>>) -> Vec<String> {
        let command = override_command.unwrap_or_else(|| self.command.argv());
        let mut args: Vec<String> = match self.backend {
            Backend::Host => vec![],
            Backend::Nix if self.packages.is_empty() => vec![
                "nix".into(),
                "develop".into(),
                self.flake.clone().unwrap_or_else(|| ".".into()),
                "--command".into(),
            ],
            Backend::Nix => {
                let mut args = vec!["nix".into(), "shell".into()];
                args.extend(self.packages.clone());
                args.push("--command".into());
                args
            }
            Backend::Devbox => vec!["devbox".into(), "run".into(), "--".into()],
            Backend::Devenv => vec!["devenv".into(), "shell".into(), "--".into()],
            Backend::Pkgx => {
                let mut args = vec!["pkgx".into()];
                args.extend(
                    self.packages
                        .iter()
                        .map(|package| format!("+{}", package.trim_start_matches('+'))),
                );
                args.push("--".into());
                args
            }
            Backend::Docker => {
                let mut args = vec![
                    "docker".into(),
                    "run".into(),
                    "--rm".into(),
                    "--name".into(),
                    container.into(),
                    "--label".into(),
                    "io.fluentci.managed=true".into(),
                    "--stop-timeout".into(),
                    self.stop_timeout_ms.div_ceil(1000).to_string(),
                ];
                for key in self.env.keys() {
                    args.extend(["--env".into(), key.clone()]);
                }
                for port in &self.ports {
                    args.extend([
                        "--publish".into(),
                        format!(
                            "127.0.0.1:{}",
                            if port.contains(':') {
                                port.clone()
                            } else {
                                format!(":{port}")
                            }
                        ),
                    ]);
                }
                for volume in &self.volumes {
                    args.extend(["--volume".into(), volume.clone()]);
                }
                args.push(self.image.clone().unwrap_or_default());
                args
            }
        };
        args.extend(command);
        args
    }
}

pub fn validate(definitions: &[Definition]) -> Result<Vec<String>> {
    let mut found = BTreeMap::new();
    for definition in definitions {
        definition.validate()?;
        anyhow::ensure!(
            found.insert(definition.name.clone(), definition).is_none(),
            "Duplicate service name {:?}",
            definition.name
        );
    }
    fn visit(
        name: &str,
        definitions: &BTreeMap<String, &Definition>,
        visiting: &mut BTreeSet<String>,
        done: &mut Vec<String>,
    ) -> Result<()> {
        if done.iter().any(|item| item == name) {
            return Ok(());
        }
        anyhow::ensure!(
            visiting.insert(name.into()),
            "Service dependency cycle at {name}"
        );
        let definition = definitions
            .get(name)
            .with_context(|| format!("Unknown service dependency {name:?}"))?;
        for dependency in &definition.depends_on {
            visit(dependency, definitions, visiting, done)?;
        }
        visiting.remove(name);
        done.push(name.into());
        Ok(())
    }
    let mut ordered = vec![];
    for name in found.keys() {
        visit(name, &found, &mut BTreeSet::new(), &mut ordered)?;
    }
    Ok(ordered)
}

pub fn discover(root: &Path) -> Result<Vec<Definition>> {
    let mut services = BTreeMap::new();
    let mut procfiles = vec![root.join("Procfile"), root.join(".fluentci/Procfile")];
    if let Ok(entries) = std::fs::read_dir(root.join(".fluentci")) {
        for entry in entries {
            procfiles.push(entry?.path().join("Procfile"));
        }
    }
    procfiles.sort();
    for path in procfiles.into_iter().filter(|path| path.is_file()) {
        for line in std::fs::read_to_string(&path)?
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
        {
            let (name, command) = line
                .split_once(':')
                .context("Invalid Procfile line: expected name: command")?;
            let mut definition: Definition = serde_json::from_value(
                serde_json::json!({"name":name.trim(),"command":command.trim()}),
            )?;
            definition.working_directory = path.parent().map(Path::to_path_buf);
            anyhow::ensure!(
                services
                    .insert(definition.name.clone(), definition)
                    .is_none(),
                "Duplicate Procfile service {name}"
            );
        }
    }
    if let Some(path) = crate::config::find(root) {
        for definition in crate::config::Config::read(&path)?.services {
            services.insert(definition.name.clone(), definition);
        }
    }
    let result: Vec<_> = services.into_values().collect();
    validate(&result)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn environment_backends_preserve_literal_argv_and_secrets() -> Result<()> {
        for (backend, prefix) in [
            (Backend::Host, vec![]),
            (Backend::Nix, vec!["nix", "develop", ".", "--command"]),
            (Backend::Devbox, vec!["devbox", "run", "--"]),
            (Backend::Devenv, vec!["devenv", "shell", "--"]),
            (Backend::Pkgx, vec!["pkgx", "--"]),
        ] {
            let mut definition: Definition = serde_json::from_value(
                json!({"name":"database","command":["postgres","-D","path with spaces"]}),
            )?;
            definition.backend = backend;
            let args = definition.argv("unused", None);
            assert_eq!(&args[..prefix.len()], prefix);
            assert_eq!(
                &args[prefix.len()..],
                ["postgres", "-D", "path with spaces"]
            );
        }
        let definition: Definition = serde_json::from_value(
            json!({"name":"db","backend":"docker","image":"postgres:17-alpine","env":{"POSTGRES_PASSWORD":"very-secret"}}),
        )?;
        let args = definition.argv("owned-container", None);
        assert!(!args.iter().any(|arg| arg.contains("very-secret")));
        assert!(args.contains(&"POSTGRES_PASSWORD".into()));
        Ok(())
    }

    #[test]
    fn http_probes_validate_declared_dynamic_port_templates() -> Result<()> {
        for port in ["8080", "9000:8080"] {
            let definition: Definition = serde_json::from_value(json!({
                "name": "web", "backend": "docker", "image": "httpbin:latest",
                "ports": [port],
                "readiness": {"type": "http", "url": "http://${port:8080}/health", "status": 200},
                "health": {"type": "http", "url": "http://${port:8080}/health", "status": 200}
            }))?;
            definition.validate()?;
        }
        for url in [
            "http://${port:9090}/health",
            "http://127.0.0.1:${port:8080}/health",
            "http://${port:8080}:invalid/health",
            "ftp://${port:8080}/health",
        ] {
            let definition: Definition = serde_json::from_value(json!({
                "name": "web", "backend": "docker", "image": "httpbin:latest",
                "ports": ["8080"],
                "readiness": {"type": "http", "url": url, "status": 200}
            }))?;
            assert!(
                definition.validate().is_err(),
                "accepted invalid URL: {url}"
            );
        }
        Ok(())
    }

    #[test]
    fn invalid_dependencies_and_provider_configuration_fail_before_starting() -> Result<()> {
        let definitions: Vec<Definition> = serde_json::from_value(
            json!([{"name":"one","command":["sleep","60"],"depends_on":["two"]},{"name":"two","command":["sleep","60"],"depends_on":["one"]}]),
        )?;
        assert!(validate(&definitions).is_err());
        for definition in [
            json!({"name":"bad/name","command":["sleep"]}),
            json!({"name":"db","backend":"docker"}),
            json!({"name":"db","command":["true"],"ports":["6379"]}),
            json!({"name":"db","command":["true"],"stop_timeout_ms":0}),
        ] {
            let definition: Definition = serde_json::from_value(definition)?;
            assert!(definition.validate().is_err());
        }
        Ok(())
    }
}
