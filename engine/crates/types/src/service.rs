use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Service {
    pub id: String,
}
