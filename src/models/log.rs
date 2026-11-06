use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub id: String,
    pub job_id: String,
    pub message: String,
    pub created_at: String,
}
