use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Hermit {
    pub id: String,
}
