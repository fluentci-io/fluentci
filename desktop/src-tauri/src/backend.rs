//! A desktop-owned API on an OS-assigned loopback port, separate from CLI Studio.

use anyhow::{Context, Result};
use fluentci::{
    db::Db,
    detection, executor,
    models::Project,
    server::{self, AppState},
    workspace::Workspace,
};
use std::{
    collections::HashSet,
    net::{Ipv4Addr, SocketAddr},
    path::Path,
    sync::Arc,
};
use tokio::{
    sync::{Mutex, oneshot},
    task::JoinHandle,
};

pub struct DesktopBackend {
    pub state: AppState,
    pub address: SocketAddr,
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<std::io::Result<()>>,
    owned_runs: Arc<Mutex<HashSet<String>>>,
    monitor: JoinHandle<()>,
}

impl DesktopBackend {
    pub async fn start(database: &Path) -> Result<Self> {
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let address = listener.local_addr()?;
        let state = AppState::new(Db::open(database).await?);
        let owned_runs = Arc::new(Mutex::new(HashSet::new()));
        let monitor_runs = owned_runs.clone();
        let mut events = state.events.subscribe();
        let monitor = tokio::spawn(async move {
            loop {
                match events.recv().await {
                    Ok(event) => {
                        let Ok(event) = serde_json::from_str::<serde_json::Value>(&event) else {
                            continue;
                        };
                        if event["channel"] != "run" {
                            continue;
                        }
                        let Some(id) = event["data"]["id"].as_str() else {
                            continue;
                        };
                        let mut runs = monitor_runs.lock().await;
                        if matches!(
                            event["data"]["status"].as_str(),
                            Some("PENDING" | "RUNNING")
                        ) {
                            runs.insert(id.to_owned());
                        } else {
                            runs.remove(id);
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        });
        let router = server::router(state.clone(), true);
        let (shutdown, stopping) = oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = stopping.await;
                })
                .await
        });
        Ok(Self {
            state,
            address,
            shutdown: Some(shutdown),
            task,
            owned_runs,
            monitor,
        })
    }

    pub fn url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub async fn stop(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        // Only this server's event stream is tracked. Never cancel runs owned
        // by a separate `fluentci studio` or CLI process sharing the database.
        let owned: Vec<_> = self.owned_runs.lock().await.iter().cloned().collect();
        for id in &owned {
            if let Ok(Some(mut run)) = self.state.db.run(id).await
                && matches!(run.status.as_deref(), Some("PENDING" | "RUNNING"))
            {
                run.status = Some("CANCELLED".into());
                if let Err(error) = self.state.db.save_run(&run).await {
                    tracing::warn!(%error, "Could not mark desktop pipeline cancelled");
                }
                executor::publish(Some(&self.state.events), "run", &run);
            }
        }
        if !owned.is_empty() {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        if tokio::time::timeout(std::time::Duration::from_secs(3), &mut self.task)
            .await
            .is_err()
        {
            self.task.abort();
        }
    }
}

impl Drop for DesktopBackend {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.task.abort();
        self.monitor.abort();
    }
}

pub fn database_path() -> Result<std::path::PathBuf> {
    if let Some(path) = std::env::var_os("FLUENTCI_DATABASE") {
        return Ok(path.into());
    }
    Ok(dirs::home_dir()
        .context("Home directory is unavailable")?
        .join(".fluentci/fluentci.db"))
}

pub async fn open_project(state: &AppState, directory: &Path) -> Result<Project> {
    let workspace = Workspace::discover(directory)?;
    let path = workspace.root.to_string_lossy().into_owned();
    if let Some(project) = state.db.project(&path).await? {
        return Ok(project);
    }
    let mut project = Project::new(path);
    project.display_name = workspace
        .root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned());
    let actions = detection::actions(&workspace.root)?;
    state.db.save_project(&project).await?;
    state.db.save_actions(&project.id, &actions).await?;
    executor::publish(Some(&state.events), "project", &project);
    Ok(project)
}
