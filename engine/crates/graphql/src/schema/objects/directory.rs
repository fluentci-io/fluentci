use std::sync::{mpsc::Receiver, Arc, Mutex};

use async_graphql::{Context, Error, Object, ID};
use fluentci_common::common;
use fluentci_core::deps::Graph;

use fluentci_common::devbox::devbox as common_devbox;
use fluentci_common::devenv::devenv as common_devenv;
use fluentci_common::directory::entries;
use fluentci_common::envhub::envhub as common_envhub;
use fluentci_common::flox::flox as common_flox;
use fluentci_common::hermit::hermit as common_hermit;
use fluentci_common::mise::mise as common_mise;
use fluentci_common::nix::nix as common_nix;
use fluentci_common::pixi::pixi as common_pixi;
use fluentci_common::pkgx::pkgx as common_pkgx;
use fluentci_common::proto::proto as common_proto;
use fluentci_ext::runner::Runner;
use fluentci_types::{directory as types, nix};
use uuid::Uuid;

use crate::schema::objects::{envhub::Envhub, file::File, mise::Mise};

use super::{
    devbox::Devbox,
    devenv::Devenv,
    flox::Flox,
    hermit::Hermit,
    nix::{Nix, NixArgs},
    pixi::Pixi,
    pkgx::Pkgx,
    proto::Proto,
    service::Service,
};

#[derive(Debug, Clone, Default)]
pub struct Directory {
    pub id: ID,
    pub path: String,
}

#[Object]
impl Directory {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn path(&self) -> &str {
        &self.path
    }

    async fn directory(&self, path: String) -> Result<Directory, Error> {
        let id = Uuid::new_v4().to_string();
        let directory = Directory { id: ID(id), path };
        Ok(directory)
    }

    async fn entries(&self) -> Result<Vec<String>, Error> {
        let path = self.path.clone();
        entries(path).map_err(|e| Error::new(e.to_string()))
    }

    async fn devbox(&self, ctx: &Context<'_>) -> Result<Devbox, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let devbox = common_devbox(graph.clone(), false)?;
        Ok(Devbox::from(devbox))
    }

    async fn devenv(&self, ctx: &Context<'_>) -> Result<Devenv, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let devenv = common_devenv(graph.clone(), false)?;
        Ok(Devenv::from(devenv))
    }

    async fn flox(&self, ctx: &Context<'_>) -> Result<Flox, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let flox = common_flox(graph.clone(), false)?;
        Ok(Flox::from(flox))
    }

    async fn hermit(&self, ctx: &Context<'_>) -> Result<Hermit, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let hermit = common_hermit(graph.clone(), false)?;
        Ok(Hermit::from(hermit))
    }

    async fn nix(&self, ctx: &Context<'_>, args: Option<NixArgs>) -> Result<Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let args: nix::NixArgs = args.unwrap_or_default().into();
        let mut g = graph.lock().unwrap();
        g.nix_args = args.clone();
        drop(g);

        let nix = common_nix(graph.clone(), false, args)?;
        Ok(Nix::from(nix))
    }

    async fn pkgx(&self, ctx: &Context<'_>) -> Result<Pkgx, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let pkgx = common_pkgx(graph.clone(), false)?;
        Ok(Pkgx::from(pkgx))
    }

    async fn pixi(&self, ctx: &Context<'_>) -> Result<Pixi, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let pixi = common_pixi(graph.clone(), false)?;
        Ok(Pixi::from(pixi))
    }

    async fn proto(&self, ctx: &Context<'_>) -> Result<Proto, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let proto = common_proto(graph.clone(), false)?;
        Ok(Proto::from(proto))
    }

    async fn mise(&self, ctx: &Context<'_>) -> Result<Mise, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mise = common_mise(graph.clone(), false)?;
        Ok(Mise::from(mise))
    }

    async fn envhub(&self, ctx: &Context<'_>) -> Result<Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let envhub = common_envhub(graph.clone(), false)?;
        Ok(Envhub::from(envhub))
    }

    async fn with_workdir(&self, ctx: &Context<'_>, path: String) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_workdir(graph.clone(), path, Arc::new(Box::new(Runner::default())))?;
        Ok(self)
    }

    async fn with_exec(&self, ctx: &Context<'_>, args: Vec<String>) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_exec(graph.clone(), args, Arc::new(Box::new(Runner::default())))?;
        Ok(self)
    }

    async fn with_service(&self, ctx: &Context<'_>, service: ID) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_service(graph.clone(), service.into())?;
        Ok(self)
    }

    async fn with_cache(
        &self,
        ctx: &Context<'_>,
        path: String,
        cache: ID,
    ) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_cache(graph.clone(), cache.into(), path)?;
        Ok(self)
    }

    async fn with_file(
        &self,
        ctx: &Context<'_>,
        path: String,
        file_id: ID,
    ) -> Result<&Directory, Error> {
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
    ) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_env_variable(graph.clone(), &name, &value)?;
        Ok(self)
    }

    async fn wait_on(
        &self,
        ctx: &Context<'_>,
        port: u32,
        timeout: Option<u32>,
    ) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::wait_on(graph.clone(), port, timeout)?;
        Ok(self)
    }

    async fn with_secret_variable(
        &self,
        ctx: &Context<'_>,
        name: String,
        secret: ID,
    ) -> Result<&Directory, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let g = graph.lock().unwrap();
        let secret_name = g.secret_names.get(secret.as_str()).unwrap().clone();
        drop(g);
        common::with_secret_variable(graph.clone(), &name, secret.as_str(), &secret_name)?;
        Ok(self)
    }
}

impl From<types::Directory> for Directory {
    fn from(directory: types::Directory) -> Self {
        Directory {
            id: ID(directory.id),
            path: directory.path,
        }
    }
}
