use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct File {
    pub id: String,
    pub path: String,
}

#[derive(Serialize, Deserialize)]
pub struct Chmod {
    pub path: String,
    pub mode: String,
}
