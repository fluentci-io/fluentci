use super::Log;
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub started_at: Option<String>,
    pub duration: Option<i32>,
    pub logs: Option<Vec<Log>>,
}
