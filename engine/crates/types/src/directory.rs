use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Directory {
    pub id: String,
    pub path: String,
}
