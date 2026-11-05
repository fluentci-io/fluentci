use std::sync::{Arc, Mutex};

use super::objects::proto::Proto;
use async_graphql::{Context, Error, Object};
use fluentci_common::proto::proto as common_proto;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct ProtoQuery;

#[Object]
impl ProtoQuery {
    async fn pixi(&self, ctx: &Context<'_>) -> Result<Proto, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let proto = common_proto(graph.clone(), true)?;
        Ok(Proto::from(proto))
    }
}
