use std::sync::{Arc, Mutex};

use crate::schema::objects::directory::Directory;
use async_graphql::{Context, Error, Object, ID};
use fluentci_common::{common, file};
use fluentci_core::deps::Graph;
use fluentci_types::file as types;

#[derive(Debug, Clone, Default)]
pub struct File {
    pub id: ID,
    pub path: String,
}

#[Object]
impl File {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn path(&self) -> &str {
        &self.path
    }

    async fn zip(&self, ctx: &Context<'_>) -> Result<File, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let file = common::zip(graph.clone(), self.path.clone())?;
        Ok(File::from(file))
    }

    async fn tar_czvf(&self, ctx: &Context<'_>) -> Result<File, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let file = common::tar_czvf(graph.clone(), self.path.clone())?;
        Ok(File::from(file))
    }

    async fn unzip(
        &self,
        ctx: &Context<'_>,
        output_dir: Option<String>,
    ) -> Result<Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let dir = file::unzip(graph.clone(), self.path.clone(), output_dir)?;
        Ok(Directory::from(dir))
    }

    async fn tar_xzvf(
        &self,
        ctx: &Context<'_>,
        output_dir: Option<String>,
    ) -> Result<Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let dir = file::tar_xzvf(graph.clone(), self.path.clone(), output_dir)?;
        Ok(Directory::from(dir))
    }

    async fn md5(&self, ctx: &Context<'_>) -> Result<String, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let hash = file::md5(graph.clone(), self.path.clone())?;
        Ok(hash)
    }

    async fn sha256(&self, ctx: &Context<'_>) -> Result<String, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let hash = file::sha256(graph.clone(), self.path.clone())?;
        Ok(hash)
    }

    async fn chmod(&self, ctx: &Context<'_>, mode: String) -> Result<File, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let file = file::chmod(graph.clone(), self.path.clone(), mode)?;
        Ok(File::from(file))
    }
}

impl From<types::File> for File {
    fn from(file: types::File) -> Self {
        Self {
            id: ID(file.id),
            path: file.path,
        }
    }
}
