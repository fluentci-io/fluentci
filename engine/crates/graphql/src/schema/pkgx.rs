use std::sync::{Arc, Mutex};

use super::objects::pkgx::Pkgx;
use async_graphql::{Context, Error, Object};
use fluentci_common::pkgx::pkgx as common_pkgx;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct PkgxQuery;

#[Object]
impl PkgxQuery {
    async fn pkgx(&self, ctx: &Context<'_>) -> Result<Pkgx, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let pkgx = common_pkgx(graph.clone(), true)?;
        Ok(Pkgx::from(pkgx))
    }
}
