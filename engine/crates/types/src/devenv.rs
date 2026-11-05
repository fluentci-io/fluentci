use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Devenv {
    pub id: String,
}
