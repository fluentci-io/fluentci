use std::sync::{Arc, Mutex};

use super::objects::devenv::Devenv;
use async_graphql::{Context, Error, Object};
use fluentci_common::devenv::devenv as common_devenv;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct DevenvQuery;

#[Object]
impl DevenvQuery {
    async fn devenv(&self, ctx: &Context<'_>) -> Result<Devenv, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let devenv = common_devenv(graph.clone(), true)?;
        Ok(Devenv::from(devenv))
    }
}
