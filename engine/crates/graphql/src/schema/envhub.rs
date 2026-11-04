use std::sync::{Arc, Mutex};

use super::objects::envhub::Envhub;
use async_graphql::{Context, Error, Object};
use fluentci_common::envhub::envhub as common_envhub;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct EnvhubQuery;

#[Object]
impl EnvhubQuery {
    async fn envhub(&self, ctx: &Context<'_>) -> Result<Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let envhub = common_envhub(graph.clone(), true)?;
        Ok(Envhub::from(envhub))
    }
}
