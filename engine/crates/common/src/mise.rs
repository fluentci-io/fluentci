use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::mise::Mise as MiseExt;
use fluentci_types::mise::Mise;
use uuid::Uuid;

pub fn mise(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Mise, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(MiseExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "mise".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(MiseExt::default())),
    ))?;

    let mise = Mise { id };
    Ok(mise)
}

pub fn trust(graph: Arc<Mutex<Graph>>) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "trust".into(),
        "mise trust".into(),
        deps,
        Arc::new(Box::new(MiseExt::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    graph.execute_vertex(&id)?;

    Ok(())
}
