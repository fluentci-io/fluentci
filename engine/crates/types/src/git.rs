use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Git {
    pub id: String,
}
