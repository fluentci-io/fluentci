use std::sync::{mpsc::Receiver, Arc, Mutex};

use async_graphql::{Context, Error, InputObject, Object, ID};
use fluentci_common::common;
use fluentci_core::deps::Graph;
use fluentci_ext::nix::Nix as NixExt;
use fluentci_types::nix as types;

use super::service::Service;

#[derive(InputObject, Default)]
pub struct NixArgs {
    pub impure: Option<bool>,
}

impl Into<types::NixArgs> for NixArgs {
    fn into(self) -> types::NixArgs {
        types::NixArgs {
            impure: self.impure.unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Nix {
    pub id: ID,
}

#[Object]
impl Nix {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn with_exec(&self, ctx: &Context<'_>, args: Vec<String>) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let g = graph.lock().unwrap();
        let nix_args = g.nix_args.clone();
        drop(g);
        common::with_exec(
            graph.clone(),
            args,
            Arc::new(Box::new(NixExt::new(nix_args))),
        )?;
        Ok(self)
    }

    async fn with_workdir(&self, ctx: &Context<'_>, path: String) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_workdir(graph.clone(), path, Arc::new(Box::new(NixExt::default())))?;
        Ok(self)
    }

    async fn with_service(&self, ctx: &Context<'_>, service: ID) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_service(graph.clone(), service.into())?;
        Ok(self)
    }

    async fn with_cache(&self, ctx: &Context<'_>, path: String, cache: ID) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_cache(graph.clone(), cache.into(), path)?;
        Ok(self)
    }

    async fn with_file(&self, ctx: &Context<'_>, path: String, file_id: ID) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_file(graph.clone(), file_id.into(), path)?;
        Ok(self)
    }

    async fn stdout(&self, ctx: &Context<'_>) -> Result<String, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let rx = ctx.data::<Arc<Mutex<Receiver<(String, usize)>>>>().unwrap();
        common::stdout(graph.clone(), rx.clone()).map_err(|e| Error::new(e.to_string()))
    }

    async fn stderr(&self, ctx: &Context<'_>) -> Result<String, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let rx = ctx.data::<Arc<Mutex<Receiver<(String, usize)>>>>().unwrap();
        common::stderr(graph.clone(), rx.clone()).map_err(|e| Error::new(e.to_string()))
    }

    async fn as_service(&self, ctx: &Context<'_>, name: String) -> Result<Service, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let service = common::as_service(graph.clone(), name)?;
        Ok(service.into())
    }

    async fn with_env_variable(
        &self,
        ctx: &Context<'_>,
        name: String,
        value: String,
    ) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_env_variable(graph.clone(), &name, &value)?;
        Ok(self)
    }

    async fn wait_on(
        &self,
        ctx: &Context<'_>,
        port: u32,
        timeout: Option<u32>,
    ) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::wait_on(graph.clone(), port, timeout)?;
        Ok(self)
    }

    async fn with_secret_variable(
        &self,
        ctx: &Context<'_>,
        name: String,
        secret: ID,
    ) -> Result<&Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let g = graph.lock().unwrap();
        let secret_name = g.secret_names.get(secret.as_str()).unwrap().clone();
        drop(g);
        common::with_secret_variable(graph.clone(), &name, secret.as_str(), &secret_name)?;
        Ok(self)
    }
}

impl From<types::Nix> for Nix {
    fn from(nix: types::Nix) -> Self {
        Self { id: ID(nix.id) }
    }
}
