use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Devbox {
    pub id: String,
}
