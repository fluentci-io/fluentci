use super::{Run, id, now};
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

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
