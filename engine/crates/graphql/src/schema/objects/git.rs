use std::sync::{Arc, Mutex};

use async_graphql::{Context, Error, Object, ID};
use fluentci_common::git as common_git;
use fluentci_core::deps::Graph;
use fluentci_types::git as types;

use super::directory::Directory;

#[derive(Debug, Clone, Default)]
pub struct Git {
    pub id: ID,
}

#[Object]
impl Git {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn branch(&self, ctx: &Context<'_>, name: String) -> Result<&Git, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common_git::branch(graph.clone(), name)?;
        Ok(&self)
    }

    async fn commit(&self, ctx: &Context<'_>) -> Result<String, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let commit = common_git::commit(graph.clone())?;
        Ok(commit)
    }

    async fn tree(&self, ctx: &Context<'_>) -> Result<Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let directory = common_git::tree(graph.clone())?;
        Ok(Directory::from(directory))
    }
}

impl From<types::Git> for Git {
    fn from(git: types::Git) -> Self {
        Self { id: ID(git.id) }
    }
}
