use std::sync::{Arc, Mutex};

use async_graphql::{Context, Error, Object, ID};
use fluentci_core::deps::Graph;
use fluentci_types::secret as types;

#[derive(Debug, Clone, Default)]
pub struct Secret {
    pub id: ID,
    pub name: String,
    pub mount: String,
}

impl From<types::Secret> for Secret {
    fn from(secret: types::Secret) -> Self {
        Self {
            id: secret.id.into(),
            name: secret.name,
            mount: secret.mount,
        }
    }
}

#[Object]
impl Secret {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn plaintext(&self, ctx: &Context<'_>) -> Result<String, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let graph = graph.lock().unwrap();
        let value = graph.get_secret_plaintext(self.id.to_string().clone(), self.name.clone())?;
        Ok(value)
    }

    async fn name(&self) -> &str {
        &self.name
    }

    async fn mount(&self) -> &str {
        &self.mount
    }
}
