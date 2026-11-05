use std::sync::{Arc, Mutex};

use super::objects::file::File;
use async_graphql::{Context, Error, Object};
use fluentci_common::http::http as common_http;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct HttpQuery;

#[Object]
impl HttpQuery {
    async fn http(&self, ctx: &Context<'_>, url: String) -> Result<File, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let http = common_http(graph.clone(), url, true)?;
        Ok(File::from(http))
    }
}
