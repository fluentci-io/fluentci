use std::sync::{Arc, Mutex};

use super::objects::pixi::Pixi;
use async_graphql::{Context, Error, Object};
use fluentci_common::pixi::pixi as common_pixi;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct PixiQuery;

#[Object]
impl PixiQuery {
    async fn pixi(&self, ctx: &Context<'_>) -> Result<Pixi, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let pixi = common_pixi(graph.clone(), true)?;
        Ok(Pixi::from(pixi))
    }
}
