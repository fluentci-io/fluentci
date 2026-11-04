use std::sync::{Arc, Mutex};

use super::objects::directory::Directory;
use async_graphql::{Context, Error, Object};
use fluentci_common::directory::directory as common_directory;
use fluentci_core::deps::Graph;

#[derive(Default, Clone)]
pub struct DirectoryQuery;

#[Object]
impl DirectoryQuery {
    async fn directory(&self, ctx: &Context<'_>, path: String) -> Result<Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let directory = common_directory(graph.clone(), path, true)?;
        Ok(Directory::from(directory))
    }
}
