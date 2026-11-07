use crate::component::{Error, Json};
use fluentci_types::secret as types;
use serde::{Deserialize, Serialize};

use crate::secret::Secret;

include!("generated/secret_manager_imports.rs");

#[derive(Serialize, Deserialize)]
pub struct SecretManager {
    pub id: String,
}

impl SecretManager {
    pub fn get_secret(&self, name: &str) -> Result<Vec<Secret>, Error> {
        let results = unsafe { get_secret(Json(vec![self.id.clone(), name.into()]))? };
        Ok(results.into_inner().into_iter().map(Into::into).collect())
    }
}
