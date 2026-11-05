use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::envhub::Envhub as EnvhubExt;
use fluentci_types::envhub::Envhub;
use uuid::Uuid;

pub fn envhub(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Envhub, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(EnvhubExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "envhub".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(EnvhubExt::default())),
    ))?;

    let envhub = Envhub { id };
    Ok(envhub)
}
