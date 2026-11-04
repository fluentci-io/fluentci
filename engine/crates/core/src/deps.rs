use anyhow::Error;
use fluentci_secrets::{Provider, Vault, VaultConfig};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::{collections::HashMap, env::current_dir, thread};
use uuid::Uuid;

use fluentci_ext::Extension;
use fluentci_types::{nix::NixArgs, secret::Secret, Output};

use crate::get_hmac;

use super::edge::Edge;
use super::vertex::Vertex;

#[derive(Default, Debug, Clone)]
pub struct Volume {
    pub id: String,
    pub label: String,
    pub path: String,
    pub key: String,
}

#[derive(Default, Clone)]
pub struct Service {
    pub id: String,
    pub name: String,
    pub vertices: Vec<Vertex>,
    pub working_dir: String,
}

pub enum GraphCommand {
    AddVolume(String, String, String),
    AddVertex(
        String,
        String,
        String,
        Vec<String>,
        Arc<Box<dyn Extension + Send + Sync>>,
    ),
    AddEnvVariable(String, String),
    AddSecretVariable(String, String, String),
    EnableService(String),
    AddEdge(usize, usize),
    Execute(Output),
    AddSecretManager(String, Provider),
}

#[derive(Clone)]
pub struct Graph {
    pub vertices: Vec<Vertex>,
    pub edges: Vec<Edge>,
    pub volumes: Vec<Volume>,
    pub services: Vec<Service>,
    pub enabled_services: Vec<Service>,
    pub vaults: HashMap<String, Arc<Box<dyn Vault + Send + Sync>>>,
    pub secrets: HashMap<String, String>,
    pub secret_names: HashMap<String, String>,

    tx: Sender<(String, usize)>,
    pub runner: Arc<Box<dyn Extension + Send + Sync>>,
    pub work_dir: String,
    pub nix_args: NixArgs,
    pub environment: std::collections::BTreeMap<String, String>,
    pub cancellation: fluentci_executor::Cancellation,
    /// Hosts embedding the library may select the matching engine worker binary.
    pub worker_executable: std::path::PathBuf,
}

impl Graph {
    pub fn new(tx: Sender<(String, usize)>, runner: Arc<Box<dyn Extension + Send + Sync>>) -> Self {
        let work_dir = current_dir().unwrap().to_str().unwrap().to_string();
        Graph {
            vertices: Vec::new(),
            volumes: Vec::new(),
            services: Vec::new(),
            enabled_services: Vec::new(),
            edges: Vec::new(),
            tx,
            runner,
            work_dir,
            nix_args: NixArgs::default(),
            environment: std::env::vars_os()
                .filter_map(|(k, v)| Some((k.into_string().ok()?, v.into_string().ok()?)))
                .collect(),
            cancellation: fluentci_executor::Cancellation::default(),
            worker_executable: std::env::current_exe().unwrap_or_default(),
            vaults: HashMap::new(),
            secrets: HashMap::new(),
            secret_names: HashMap::new(),
        }
    }

    pub fn set_secret(&mut self, name: String, value: String) -> Result<String, Error> {
        let id = Uuid::new_v4().to_string();
        let key = get_hmac(id.clone(), name.clone())?;
        self.secrets.insert(key, value);
        self.secret_names.insert(id.clone(), name);
        Ok(id)
    }

    pub fn get_secret_plaintext(&self, secret_id: String, name: String) -> Result<String, Error> {
        let key = get_hmac(secret_id, name)?;
        match self.secrets.get(&key) {
            Some(value) => Ok(value.clone()),
            None => Err(Error::msg("Secret not found")),
        }
    }

    pub fn get_secret(
        &mut self,
        secret_manager_id: &str,
        name: String,
    ) -> Result<Vec<Secret>, Error> {
        match self.vaults.get(secret_manager_id) {
            Some(provider) => {
                let provider = provider.clone();
                let cloned_name = name.clone();
                let handler = thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(provider.download_json(&name))
                });
                let secrets = match handler.join() {
                    Ok(Ok(secrets)) => secrets,
                    Ok(Err(e)) => return Err(Error::msg(e)),
                    Err(_) => return Err(Error::msg("Failed to join thread")),
                };

                if secrets.is_empty() {
                    return Err(Error::msg(format!("Secret {} not found", cloned_name)));
                }

                let mut results = Vec::new();
                secrets.iter().for_each(|(key, value)| {
                    let id = Uuid::new_v4().to_string();
                    let hmac = get_hmac(id.clone(), key.clone()).unwrap();
                    self.secrets.insert(hmac, value.clone());
                    self.secret_names.insert(id.clone(), key.clone());
                    results.push(Secret {
                        id: id.clone(),
                        name: key.clone(),
                        mount: cloned_name.clone(),
                    });
                });

                Ok(results)
            }
            None => Err(Error::msg(format!(
                "Secret manager {} not found",
                secret_manager_id
            ))),
        }
    }

    pub fn register_service(&mut self, id: &str) -> Result<(), Error> {
        let order = self.execution_order()?;
        let Some(index) = self
            .vertices
            .iter()
            .position(|v| v.id == id && v.label == "asService")
        else {
            return Err(Error::msg("service vertex not found"));
        };
        let mut selected = std::collections::HashSet::new();
        let mut pending = vec![index];
        while let Some(i) = pending.pop() {
            if !selected.insert(i) {
                continue;
            }
            for edge in self.edges.iter().filter(|e| e.to == i) {
                pending.push(edge.from);
            }
            for need in &self.vertices[i].needs {
                if let Some(parent) = self.vertices.iter().position(|v| &v.id == need) {
                    pending.push(parent);
                }
            }
        }
        // Registration records data; commands and provider setup run in executor workers.
        let vertices = order
            .into_iter()
            .filter(|i| selected.contains(i))
            .map(|i| self.vertices[i].clone())
            .collect();
        self.services.push(Service {
            id: id.into(),
            name: self.vertices[index].command.clone(),
            vertices,
            working_dir: self.work_dir.clone(),
        });
        Ok(())
    }

    pub fn execute(&mut self, command: GraphCommand) -> Result<(), Error> {
        match command {
            GraphCommand::AddVolume(id, label, path) => {
                self.volumes.push(Volume {
                    id,
                    label,
                    key: path.clone(),
                    path,
                });
            }
            GraphCommand::AddVertex(id, label, command, needs, runner) => {
                match self.vertices.iter_mut().find(|v| v.id == id) {
                    Some(vertex) => vertex.needs.extend(needs),
                    None => self.vertices.push(Vertex {
                        id,
                        label,
                        command,
                        needs,
                        runner,
                    }),
                }
            }
            GraphCommand::AddEdge(from, to) => {
                self.edges.push(Edge { from, to });
            }
            GraphCommand::AddEnvVariable(key, value) => {
                self.environment.insert(key, value);
            }
            GraphCommand::AddSecretVariable(env_name, secret_id, secret_name) => {
                let value = self.get_secret_plaintext(secret_id, secret_name)?;
                self.environment.insert(env_name, value);
            }
            GraphCommand::Execute(Output::Stdout) => {
                self.execute_graph(Output::Stdout);
            }
            GraphCommand::Execute(Output::Stderr) => {
                self.execute_graph(Output::Stderr);
            }
            GraphCommand::EnableService(id) => match self.services.iter().find(|s| s.id == id) {
                Some(service) => self.enabled_services.push(service.clone()),
                None => return Err(Error::msg("Service not found")),
            },
            GraphCommand::AddSecretManager(id, provider) => match provider {
                Provider::Aws(config) => {
                    self.vaults
                        .insert(id, Arc::new(Box::new(config.into_vault()?)));
                }
                Provider::Google(config) => {
                    self.vaults
                        .insert(id, Arc::new(Box::new(config.into_vault()?)));
                }
                Provider::Hashicorp(config) => {
                    self.vaults
                        .insert(id, Arc::new(Box::new(config.into_vault()?)));
                }
                Provider::Azure(config) => {
                    self.vaults
                        .insert(id, Arc::new(Box::new(config.into_vault()?)));
                }
            },
        }
        Ok(())
    }

    /// Validate both legacy edge representations and produce a dependency-safe order.
    pub(crate) fn execution_order(&self) -> Result<Vec<usize>, Error> {
        let ids: Vec<_> = self.vertices.iter().map(|v| v.id.clone()).collect();
        let mut needs: Vec<_> = self.vertices.iter().map(|v| v.needs.clone()).collect();
        for edge in &self.edges {
            if edge.from >= ids.len() || edge.to >= ids.len() {
                return Err(Error::msg("Graph edge references a missing vertex"));
            }
            needs[edge.to].push(ids[edge.from].clone());
        }
        fluentci_executor::graph::DependencyGraph::new(&ids, &needs)
            .map(|graph| graph.order)
            .map_err(Error::msg)
    }

    pub fn execute_graph(&mut self, output: Output) {
        let result = crate::legacy_plan::execute(self, None, output);
        self.enabled_services.clear();
        let completion = match result {
            Ok(output) => (output, 0),
            Err(error) => {
                let code = error
                    .downcast_ref::<fluentci_executor::diagnostics::ExecutionFailure>()
                    .and_then(|failure| usize::try_from(failure.exit_code).ok())
                    .filter(|code| *code != 0)
                    .unwrap_or(1);
                (format!("{error:#}"), code)
            }
        };
        let _ = self.tx.send(completion);
    }

    pub fn execute_vertex(&mut self, id: &str) -> Result<String, Error> {
        crate::legacy_plan::execute(self, Some(id), Output::Stdout)
    }

    pub fn size(&self) -> usize {
        self.vertices.len()
    }

    pub fn reset(&mut self) {
        self.vertices.clear();
        self.edges.clear();
        self.work_dir = current_dir().unwrap().to_str().unwrap().to_string();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;

    use fluentci_ext::runner::Runner;

    use super::*;

    #[test]
    fn test_graph() -> Result<(), Error> {
        let (tx, _) = mpsc::channel();
        let mut graph = Graph::new(tx, Arc::new(Box::new(Runner::default())));
        graph.execute(GraphCommand::AddVertex(
            "1".into(),
            "A".into(),
            "echo A".into(),
            vec![],
            Arc::new(Box::new(Runner::default())),
        ))?;
        graph.execute(GraphCommand::AddVertex(
            "2".into(),
            "B".into(),
            "echo B".into(),
            vec!["1".into()],
            Arc::new(Box::new(Runner::default())),
        ))?;
        graph.execute(GraphCommand::AddVertex(
            "3".into(),
            "C".into(),
            "echo C".into(),
            vec!["1".into()],
            Arc::new(Box::new(Runner::default())),
        ))?;
        graph.execute(GraphCommand::AddVertex(
            "4".into(),
            "D".into(),
            "echo D".into(),
            vec!["2".into(), "3".into()],
            Arc::new(Box::new(Runner::default())),
        ))?;
        graph.execute(GraphCommand::AddEdge(0, 1))?;
        graph.execute(GraphCommand::AddEdge(0, 2))?;
        graph.execute(GraphCommand::AddEdge(1, 3))?;
        graph.execute(GraphCommand::AddEdge(2, 3))?;

        assert_eq!(graph.size(), 4);
        assert_eq!(graph.vertices[0].id, "1");
        assert_eq!(graph.vertices[1].id, "2");
        assert_eq!(graph.vertices[2].id, "3");
        assert_eq!(graph.vertices[3].id, "4");
        assert_eq!(graph.vertices[0].label, "A");
        assert_eq!(graph.vertices[1].label, "B");
        assert_eq!(graph.vertices[2].label, "C");
        assert_eq!(graph.vertices[3].label, "D");
        assert_eq!(graph.vertices[0].command, "echo A");
        assert_eq!(graph.vertices[1].command, "echo B");
        assert_eq!(graph.vertices[2].command, "echo C");
        assert_eq!(graph.vertices[3].command, "echo D");

        graph.execute(GraphCommand::Execute(Output::Stdout))?;

        graph.reset();

        assert_eq!(graph.size(), 0);
        Ok(())
    }
}
