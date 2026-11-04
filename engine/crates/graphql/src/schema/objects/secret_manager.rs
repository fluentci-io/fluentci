use std::sync::{Arc, Mutex};

use crate::schema::objects::secret::Secret;
use async_graphql::{Context, Error, Object, ID};
use fluentci_common::common;
use fluentci_core::deps::Graph;

#[derive(Debug, Clone, Default)]
pub struct SecretManager {
    pub id: ID,
}

#[Object]
impl SecretManager {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn get_secret(&self, ctx: &Context<'_>, name: String) -> Result<Vec<Secret>, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let secret = common::get_secret(graph.clone(), self.id.as_str(), &name)?;
        Ok(secret.into_iter().map(Into::into).collect())
    }
}
