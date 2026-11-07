use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct DependencyConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Process {
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_daemon: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depends_on: Option<HashMap<String, DependencyConfig>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct ConfigFile {
    pub version: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_location: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_level: Option<String>,

    pub processes: HashMap<String, Process>,
}
