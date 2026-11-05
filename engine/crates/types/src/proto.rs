use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Proto {
    pub id: String,
}
