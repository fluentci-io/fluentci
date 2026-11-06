use super::Job;
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub name: String,
    pub project: String,
    pub project_id: String,
    #[serde(default = "crate::workflows::default_id")]
    pub workflow_id: String,
    #[serde(default)]
    pub workflow_name: Option<String>,
    pub title: String,
    pub message: Option<String>,
    pub commit: Option<String>,
    pub author: Option<String>,
    pub branch: Option<String>,
    pub duration: i32,
    pub date: String,
    pub jobs: Vec<Job>,
    pub cursor: Option<String>,
    pub status: Option<String>,
}

impl Default for Run {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            project: String::new(),
            project_id: String::new(),
            workflow_id: crate::workflows::default_id(),
            workflow_name: None,
            title: String::new(),
            message: None,
            commit: None,
            author: None,
            branch: None,
            duration: 0,
            date: String::new(),
            jobs: vec![],
            cursor: None,
            status: None,
        }
    }
}
