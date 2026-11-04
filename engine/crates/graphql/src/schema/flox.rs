use std::sync::{Arc, Mutex};

use super::objects::flox::Flox;
use async_graphql::{Context, Error, Object};
use fluentci_common::flox::flox as common_flox;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct FloxQuery;

#[Object]
impl FloxQuery {
    async fn flox(&self, ctx: &Context<'_>) -> Result<Flox, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let flox = common_flox(graph.clone(), true)?;
        Ok(Flox::from(flox))
    }
}
