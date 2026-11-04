use std::sync::{Arc, Mutex};

use super::objects::hermit::Hermit;
use async_graphql::{Context, Error, Object};
use fluentci_common::hermit::hermit as common_hermit;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct HermitQuery;

#[Object]
impl HermitQuery {
    async fn hermit(&self, ctx: &Context<'_>) -> Result<Hermit, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let hermit = common_hermit(graph.clone(), true)?;
        Ok(Hermit::from(hermit))
    }
}
