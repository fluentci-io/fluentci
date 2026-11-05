use std::sync::{Arc, Mutex};

use super::objects::file::File;
use async_graphql::{Context, Error, Object};
use fluentci_common::file::file as common_file;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct FileQuery;

#[Object]
impl FileQuery {
    async fn file(&self, ctx: &Context<'_>, path: String) -> Result<File, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let file = common_file(graph.clone(), path, true)?;
        Ok(File::from(file))
    }
}
