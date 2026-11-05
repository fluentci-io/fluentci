use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::devenv::Devenv as DevenvExt;
use fluentci_types::devenv::Devenv;
use uuid::Uuid;

pub fn devenv(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Devenv, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(DevenvExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "devenv".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(DevenvExt::default())),
    ))?;

    let devenv = Devenv { id };
    Ok(devenv)
}
