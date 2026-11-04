use async_graphql::{InputObject, SimpleObject};
use serde::{Deserialize, Serialize};

pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub path: String,
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub created_at: String,
    pub picture: String,
    pub cursor: Option<String>,
    pub speed: Option<f64>,
    pub reliability: Option<f64>,
    pub builds_per_week: Option<i32>,
    pub recent_runs: Option<Vec<Run>>,
    pub is_private: Option<bool>,
    pub owner: Option<String>,
    pub archived: Option<bool>,
    pub repository_url: Option<String>,
}

impl Project {
    pub fn new(path: String) -> Self {
        let id = id();
        Self {
            name: format!("project-{}", &id[..8]),
            id,
            path,
            created_at: now(),
            picture: "https://img.icons8.com/color-glass/96/code.png".into(),
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "ActionInput")]
#[serde(rename_all = "camelCase")]
pub struct Action {
    #[graphql(skip_input)]
    pub id: Option<String>,
    pub name: String,
    pub commands: String,
    pub enabled: bool,
    pub plugin: String,
    pub use_wasm: bool,
    pub logo: Option<String>,
    pub github_url: Option<String>,
    pub env: Option<Vec<String>>,
    pub working_directory: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub name: String,
    pub project: String,
    pub project_id: String,
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

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub id: String,
    pub job_id: String,
    pub message: String,
    pub created_at: String,
}
