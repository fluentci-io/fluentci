use std::sync::{Arc, Mutex};

use super::objects::mise::Mise;
use async_graphql::{Context, Error, Object};
use fluentci_common::mise::mise as common_mise;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct MiseQuery;

#[Object]
impl MiseQuery {
    async fn mise(&self, ctx: &Context<'_>) -> Result<Mise, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mise = common_mise(graph.clone(), true)?;
        Ok(Mise::from(mise))
    }
}
