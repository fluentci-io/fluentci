use std::sync::{Arc, Mutex};

use super::objects::devbox::Devbox;
use async_graphql::{Context, Error, Object};
use fluentci_common::devbox::devbox as common_devbox;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct DevboxQuery;

#[Object]
impl DevboxQuery {
    async fn devbox(&self, ctx: &Context<'_>) -> Result<Devbox, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let devbox = common_devbox(graph.clone(), true)?;
        Ok(Devbox::from(devbox))
    }
}
