//! Pure task descriptions. Serialize only when crossing the host boundary.
pub use fluentci_primitives::*;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize)]
pub struct Task {
    pub id: String,
    pub cwd: String,
    pub program: String,
    pub args: Vec<String>,
    pub needs: Vec<String>,
    pub env: BTreeMap<String, String>,
    pub primitive: Operation,
    pub timeout_ms: Option<u64>,
}

pub fn task(id: impl Into<String>, primitive: Operation, cwd: impl Into<String>) -> Task {
    Task {
        id: id.into(),
        cwd: cwd.into(),
        program: String::new(),
        args: vec![],
        needs: vec![],
        env: BTreeMap::new(),
        primitive,
        timeout_ms: None,
    }
}

impl Task {
    pub fn after(mut self, dependency: &Task) -> Self {
        self.needs.push(dependency.id.clone());
        self
    }

    pub fn with_env(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(name.into(), value.into());
        self
    }

    pub fn with_timeout(mut self, milliseconds: u64) -> Self {
        self.timeout_ms = Some(milliseconds);
        self
    }
}
