use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
pub struct Cache {
    pub id: String,
    pub key: String,
    pub path: String,
}
