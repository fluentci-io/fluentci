use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Nix {
    pub id: String,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct NixArgs {
    pub impure: bool,
}
