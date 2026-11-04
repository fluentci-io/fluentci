use std::env;

use anyhow::Error;
use reqwest::blocking::Client;
use serde::Serialize;
use uuid::Uuid;

const URL: &str = "https://events.baselime.io/v1/logs";

pub enum Level {
    Info,
    Error,
}

#[derive(Serialize, Default)]
pub struct Payload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub namespace: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "gitCommitMessage")]
    pub git_commit_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "gitBranch")]
    pub git_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "gitCommitHash")]
    pub git_commit_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "gitRemoteUrl")]
    pub git_remote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "gitAuthor")]
    pub git_author: Option<String>,
}

pub struct Baselime {
    client: Client,
}

pub fn new() -> Baselime {
    let client = reqwest::blocking::Client::new();
    Baselime { client }
}

impl Baselime {
    pub fn send(&self, data: String, level: Level, namespace: String) -> Result<(), Error> {
        match env::var("BASELIME_API_KEY") {
            Ok(api_key) => {
                let json = match level {
                    Level::Info => serde_json::to_string(&vec![Payload {
                        message: Some(data),
                        request_id: Uuid::new_v4().to_string(),
                        namespace,
                        git_commit_message: Some(
                            env::var("GIT_COMMIT_MESSAGE").unwrap_or_default(),
                        ),
                        git_branch: Some(env::var("GIT_BRANCH").unwrap_or_default()),
                        git_commit_hash: Some(env::var("GIT_COMMIT_HASH").unwrap_or_default()),
                        git_remote_url: Some(env::var("GIT_REMOTE_URL").unwrap_or_default()),
                        git_author: Some(env::var("GIT_AUTHOR").unwrap_or_default()),
                        ..Default::default()
                    }])?,
                    Level::Error => serde_json::to_string(&vec![Payload {
                        error: Some(data.to_string()),
                        request_id: Uuid::new_v4().to_string(),
                        namespace,
                        git_commit_message: Some(
                            env::var("GIT_COMMIT_MESSAGE").unwrap_or_default(),
                        ),
                        git_branch: Some(env::var("GIT_BRANCH").unwrap_or_default()),
                        git_commit_hash: Some(env::var("GIT_COMMIT_HASH").unwrap_or_default()),
                        git_remote_url: Some(env::var("GIT_REMOTE_URL").unwrap_or_default()),
                        git_author: Some(env::var("GIT_AUTHOR").unwrap_or_default()),
                        ..Default::default()
                    }])?,
                };
                self.client
                    .post(URL)
                    .header("x-api-key", api_key)
                    .header("x-service", "fluentci-core")
                    .header("Content-Type", "application/json")
                    .body(json)
                    .send()?;
                Ok(())
            }
            Err(e) => Err(Error::msg(format!("BASELIME_API_KEY not set: {}", e)))?,
        }
    }

    pub fn send_with_duration(
        &self,
        data: String,
        level: Level,
        namespace: String,
        duration: u128,
    ) -> Result<(), Error> {
        match env::var("BASELIME_API_KEY") {
            Ok(api_key) => {
                let json = match level {
                    Level::Info => serde_json::to_string(&vec![Payload {
                        message: Some(data),
                        request_id: Uuid::new_v4().to_string(),
                        namespace,
                        git_commit_message: Some(
                            env::var("GIT_COMMIT_MESSAGE").unwrap_or_default(),
                        ),
                        git_branch: Some(env::var("GIT_BRANCH").unwrap_or_default()),
                        git_commit_hash: Some(env::var("GIT_COMMIT_HASH").unwrap_or_default()),
                        git_remote_url: Some(env::var("GIT_REMOTE_URL").unwrap_or_default()),
                        git_author: Some(env::var("GIT_AUTHOR").unwrap_or_default()),
                        duration: Some(duration),
                        ..Default::default()
                    }])?,
                    Level::Error => serde_json::to_string(&vec![Payload {
                        error: Some(data.to_string()),
                        request_id: Uuid::new_v4().to_string(),
                        namespace,
                        git_commit_message: Some(
                            env::var("GIT_COMMIT_MESSAGE").unwrap_or_default(),
                        ),
                        git_branch: Some(env::var("GIT_BRANCH").unwrap_or_default()),
                        git_commit_hash: Some(env::var("GIT_COMMIT_HASH").unwrap_or_default()),
                        git_remote_url: Some(env::var("GIT_REMOTE_URL").unwrap_or_default()),
                        git_author: Some(env::var("GIT_AUTHOR").unwrap_or_default()),
                        duration: Some(duration),
                        ..Default::default()
                    }])?,
                };
                self.client
                    .post(URL)
                    .header("x-api-key", api_key)
                    .header("x-service", "fluentci-core")
                    .header("Content-Type", "application/json")
                    .body(json)
                    .send()?;
                Ok(())
            }
            Err(e) => Err(Error::msg(format!("BASELIME_API_KEY not set: {}", e)))?,
        }
    }
}
