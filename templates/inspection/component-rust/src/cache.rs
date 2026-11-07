use fluentci_types::cache as types;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Cache {
    pub id: String,
    pub key: String,
}

impl From<types::Cache> for Cache {
    fn from(cache: types::Cache) -> Self {
        Cache {
            id: cache.id,
            key: cache.key,
        }
    }
}
