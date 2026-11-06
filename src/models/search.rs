use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub kind: String,
    pub project_id: String,
    pub run_id: Option<String>,
    pub job_id: Option<String>,
    pub title: String,
    pub excerpt: String,
    pub created_at: String,
}
