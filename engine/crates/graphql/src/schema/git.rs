use std::sync::{Arc, Mutex};

use super::objects::git::Git;
use async_graphql::{Context, Error, Object};
use fluentci_common::git::git as common_git;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct GitQuery;

#[Object]
impl GitQuery {
    async fn git(&self, ctx: &Context<'_>, url: String) -> Result<Git, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let git = common_git(graph.clone(), url, true)?;
        Ok(Git::from(git))
    }
}
