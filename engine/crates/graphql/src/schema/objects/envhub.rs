use std::sync::{mpsc::Receiver, Arc, Mutex};

use async_graphql::{Context, Error, Object, ID};
use fluentci_common::common;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::envhub::Envhub as EnvhubExt;
use fluentci_types::envhub as types;
use uuid::Uuid;

use super::service::Service;

#[derive(Debug, Clone, Default)]
pub struct Envhub {
    pub id: ID,
}

#[Object]
impl Envhub {
    async fn id(&self) -> &ID {
        &self.id
    }

    async fn r#use(&self, ctx: &Context<'_>, environment: String) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let mut graph = graph.lock().unwrap();

        let id = Uuid::new_v4().to_string();
        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "useEnv".into(),
            environment,
            deps,
            Arc::new(Box::new(EnvhubExt::default())),
        ))?;

        if graph.size() > 2 {
            let x = graph.size() - 2;
            let y = graph.size() - 1;
            graph.execute(GraphCommand::AddEdge(x, y))?;
        }

        Ok(self)
    }

    async fn with_exec(&self, ctx: &Context<'_>, args: Vec<String>) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_exec(
            graph.clone(),
            args,
            Arc::new(Box::new(EnvhubExt::default())),
        )?;
        Ok(self)
    }

    async fn with_workdir(&self, ctx: &Context<'_>, path: String) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_workdir(
            graph.clone(),
            path,
            Arc::new(Box::new(EnvhubExt::default())),
        )?;
        Ok(self)
    }

    async fn with_service(&self, ctx: &Context<'_>, service: ID) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_service(graph.clone(), service.into())?;
        Ok(self)
    }

    async fn with_cache(
        &self,
        ctx: &Context<'_>,
        path: String,
        cache: ID,
    ) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_cache(graph.clone(), cache.into(), path)?;
        Ok(self)
    }

    async fn with_file(
        &self,
        ctx: &Context<'_>,
        path: String,
        file_id: ID,
    ) -> Result<&Envhub, Error> {
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
    ) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::with_env_variable(graph.clone(), &name, &value)?;
        Ok(self)
    }

    async fn wait_on(
        &self,
        ctx: &Context<'_>,
        port: u32,
        timeout: Option<u32>,
    ) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        common::wait_on(graph.clone(), port, timeout)?;
        Ok(self)
    }

    async fn with_secret_variable(
        &self,
        ctx: &Context<'_>,
        name: String,
        secret: ID,
    ) -> Result<&Envhub, Error> {
        let graph = ctx.data::<Arc<Mutex<Graph>>>().unwrap();
        let g = graph.lock().unwrap();
        let secret_name = g.secret_names.get(secret.as_str()).unwrap().clone();
        drop(g);
        common::with_secret_variable(graph.clone(), &name, secret.as_str(), &secret_name)?;
        Ok(self)
    }
}

impl From<types::Envhub> for Envhub {
    fn from(envhub: types::Envhub) -> Self {
        Self { id: ID(envhub.id) }
    }
}
