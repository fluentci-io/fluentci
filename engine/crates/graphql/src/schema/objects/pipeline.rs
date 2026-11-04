use std::{
    fs::{self},
    sync::{mpsc::Receiver, Arc, Mutex},
};

use async_graphql::{Context, Error, Object, ID};
use fluentci_common::common;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::devbox::Devbox as DevboxExt;
use fluentci_ext::devenv::Devenv as DevenvExt;
use fluentci_ext::envhub::Envhub as EnvhubExt;
use fluentci_ext::flox::Flox as FloxExt;
use fluentci_ext::git::Git as GitExt;
use fluentci_ext::hermit::Hermit as HermitExt;
use fluentci_ext::http::Http as HttpExt;
use fluentci_ext::mise::Mise as MiseExt;
use fluentci_ext::nix::Nix as NixExt;
use fluentci_ext::pixi::Pixi as PixiExt;
use fluentci_ext::pkgx::Pkgx as PkgxExt;
use fluentci_ext::proto::Proto as ProtoExt;
use fluentci_ext::runner::Runner;
use fluentci_types::{nix, pipeline as types};
use uuid::Uuid;

use crate::{
    schema::objects::{file::File, git::Git, mise::Mise, nix::NixArgs},
    util::{extract_git_repo, validate_git_url},
};

use super::{
    devbox::Devbox, devenv::Devenv, envhub::Envhub, flox::Flox, hermit::Hermit, nix::Nix,
    pixi::Pixi, pkgx::Pkgx, proto::Proto, service::Service,
};

#[derive(Debug, Clone, Default)]
pub struct Pipeline {
    pub id: ID,
}

#[Object]
impl Pipeline {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn http(&self, ctx: &Context<'_>, url: String) -> Result<File, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(HttpExt::default()));
        graph.work_dir = format!(
            "{}/.fluentci/cache",
            dirs::home_dir().unwrap().to_str().unwrap()
        );
        fs::create_dir_all(&graph.work_dir)?;

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };

        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "http".into(),
            url.clone(),
            deps,
            Arc::new(Box::new(HttpExt::default())),
        ))?;
        graph.execute_vertex(&id)?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }
        let filename = sha256::digest(url).to_string();
        let work_dir = graph.work_dir.clone();

        let file = File {
            id: ID(id.clone()),
            path: format!("{}/{}", work_dir, filename),
        };

        graph.execute(GraphCommand::AddVolume(
            id,
            "file".into(),
            file.path.clone(),
        ))?;

        Ok(file)
    }

    async fn git(&self, ctx: &Context<'_>, url: String) -> Result<Git, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(GitExt::default()));
        graph.work_dir = format!(
            "{}/.fluentci/cache",
            dirs::home_dir().unwrap().to_str().unwrap()
        );

        if !validate_git_url(&url) {
            return Err(Error::new("Invalid git url"));
        }
        let repo = extract_git_repo(&url);
        graph.work_dir = format!("{}/{}", graph.work_dir, repo);

        fs::create_dir_all(&graph.work_dir)?;

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "git".into(),
            url.clone(),
            deps,
            Arc::new(Box::new(GitExt::default())),
        ))?;
        graph.execute_vertex(&id)?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        graph.work_dir = format!(
            "{}/{}",
            graph.work_dir,
            url.split("/").last().unwrap().replace(".git", "")
        );

        let git = Git { id: ID(id) };
        Ok(git)
    }

    async fn devbox(&self, ctx: &Context<'_>) -> Result<Devbox, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(DevboxExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "devbox".into(),
            "".into(),
            deps,
            Arc::new(Box::new(DevboxExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let devbox = Devbox { id: ID(id) };
        Ok(devbox)
    }

    async fn devenv(&self, ctx: &Context<'_>) -> Result<Devenv, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(DevenvExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "devenv".into(),
            "".into(),
            deps,
            Arc::new(Box::new(DevenvExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let devenv = Devenv { id: ID(id) };
        Ok(devenv)
    }

    async fn flox(&self, ctx: &Context<'_>) -> Result<Flox, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(FloxExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "flox".into(),
            "".into(),
            deps,
            Arc::new(Box::new(FloxExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let flox = Flox { id: ID(id) };
        Ok(flox)
    }

    async fn nix(&self, ctx: &Context<'_>, args: Option<NixArgs>) -> Result<Nix, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        let args: nix::NixArgs = args.unwrap_or_default().into();
        graph.runner = Arc::new(Box::new(NixExt::new(args.clone())));
        graph.nix_args = args.clone();

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };

        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "nix".into(),
            "".into(),
            deps,
            Arc::new(Box::new(NixExt::new(args))),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let nix = Nix { id: ID(id) };
        Ok(nix)
    }

    async fn pkgx(&self, ctx: &Context<'_>) -> Result<Pkgx, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(PkgxExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "pkgx".into(),
            "".into(),
            deps,
            Arc::new(Box::new(PkgxExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let pkgx = Pkgx { id: ID(id) };
        Ok(pkgx)
    }

    async fn pixi(&self, ctx: &Context<'_>) -> Result<Pixi, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(PixiExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "pixi".into(),
            "".into(),
            deps,
            Arc::new(Box::new(PixiExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let pixi = Pixi { id: ID(id) };
        Ok(pixi)
    }

    async fn proto(&self, ctx: &Context<'_>) -> Result<Proto, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(ProtoExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "proto".into(),
            "".into(),
            deps,
            Arc::new(Box::new(ProtoExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let proto = Proto { id: ID(id) };
        Ok(proto)
    }

    async fn hermit(&self, ctx: &Context<'_>) -> Result<Hermit, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(HermitExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "hermit".into(),
            "".into(),
            deps,
            Arc::new(Box::new(HermitExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let hermit = Hermit { id: ID(id) };
        Ok(hermit)
    }

    async fn mise(&self, ctx: &Context<'_>) -> Result<Mise, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(MiseExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "mise".into(),
            "".into(),
            deps,
            Arc::new(Box::new(MiseExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let mise = Mise { id: ID(id) };
        Ok(mise)
    }

    async fn envhub(&self, ctx: &Context<'_>) -> Result<Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();
        graph.runner = Arc::new(Box::new(EnvhubExt::default()));

        let id = Uuid::new_v4().to_string();

        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "envhub".into(),
            "".into(),
            deps,
            Arc::new(Box::new(EnvhubExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        let envhub = Envhub { id: ID(id) };
        Ok(envhub)
    }

    async fn with_exec(&self, ctx: &Context<'_>, args: Vec<String>) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_exec(graph.clone(), args, Arc::new(Box::new(Runner::default())))?;
        Ok(self)
    }

    async fn with_workdir(&self, ctx: &Context<'_>, path: String) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_workdir(graph.clone(), path, Arc::new(Box::new(Runner::default())))?;
        Ok(self)
    }

    async fn with_service(&self, ctx: &Context<'_>, service: ID) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_service(graph.clone(), service.into())?;
        Ok(self)
    }

    async fn with_cache(
        &self,
        ctx: &Context<'_>,
        path: String,
        cache: ID,
    ) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_cache(graph.clone(), cache.into(), path)?;
        Ok(self)
    }

    async fn with_file(
        &self,
        ctx: &Context<'_>,
        path: String,
        file_id: ID,
    ) -> Result<&Pipeline, Error> {
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
    ) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_env_variable(graph.clone(), &name, &value)?;
        Ok(self)
    }

    async fn wait_on(
        &self,
        ctx: &Context<'_>,
        port: u32,
        timeout: Option<u32>,
    ) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::wait_on(graph.clone(), port, timeout)?;
        Ok(self)
    }

    async fn with_secret_variable(
        &self,
        ctx: &Context<'_>,
        name: String,
        secret: ID,
    ) -> Result<&Pipeline, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let g = graph.lock().unwrap();
        let secret_name = g.secret_names.get(secret.as_str()).unwrap().clone();
        drop(g);
        common::with_secret_variable(graph.clone(), &name, secret.as_str(), &secret_name)?;
        Ok(self)
    }
}

impl From<types::Pipeline> for Pipeline {
    fn from(pipeline: types::Pipeline) -> Self {
        Self {
            id: ID(pipeline.id),
        }
    }
}
