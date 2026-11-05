use std::{process::ExitStatus, sync::Arc};

use fluentci_ext::Extension;

#[derive(Debug, Clone, Default)]
pub struct VertexExecOutput {
    pub stdout: String,
    pub stderr: String,
    pub status: ExitStatus,
}

#[derive(Clone)]
pub struct Vertex {
    pub id: String,
    pub label: String,
    pub command: String,
    pub needs: Vec<String>,
    pub runner: Arc<Box<dyn Extension + Send + Sync>>,
}
