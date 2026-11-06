use super::WorkflowEvents;
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub events: WorkflowEvents,
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub env: Vec<String>,
    pub path: Option<String>,
    pub revision: Option<String>,
    pub step_count: i32,
    pub legacy: bool,
}
