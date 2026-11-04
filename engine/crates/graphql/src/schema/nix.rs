use std::sync::{Arc, Mutex};

use crate::schema::objects::nix::NixArgs;

use super::objects::nix::Nix;
use async_graphql::{Context, Error, Object};
use fluentci_common::nix::nix as common_nix;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct NixQuery;

#[Object]
impl NixQuery {
    async fn nix(&self, ctx: &Context<'_>, args: Option<NixArgs>) -> Result<Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let args = args.unwrap_or_default().into();
        let nix = common_nix(graph.clone(), true, args)?;
        Ok(Nix::from(nix))
    }
}
