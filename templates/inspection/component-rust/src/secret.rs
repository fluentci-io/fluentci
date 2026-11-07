use crate::component::{Error, Json};
use fluentci_types::secret as types;
use serde::{Deserialize, Serialize};

include!("generated/secret_imports.rs");

#[derive(Serialize, Deserialize)]
pub struct Secret {
    pub id: String,
    pub name: String,
    pub mount: String,
}

impl From<types::Secret> for Secret {
    fn from(secret: types::Secret) -> Self {
        Secret {
            id: secret.id,
            name: secret.name,
            mount: secret.mount,
        }
    }
}

impl Secret {
    pub fn plaintext(&self) -> Result<String, Error> {
        unsafe { get_secret_plaintext(Json(vec![self.id.clone(), self.name.clone()])) }
    }
}
