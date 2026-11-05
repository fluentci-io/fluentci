use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::hermit::Hermit as HermitExt;
use fluentci_types::hermit::Hermit;
use uuid::Uuid;

pub fn hermit(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Hermit, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(HermitExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "hermit".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(HermitExt::default())),
    ))?;

    let hermit = Hermit { id };
    Ok(hermit)
}

pub fn with_packages(graph: Arc<Mutex<Graph>>, packages: Vec<String>) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "withPackages".into(),
        format!("hermit install {}", packages.join(" ")),
        deps,
        Arc::new(Box::new(HermitExt::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    Ok(())
}

pub fn install(graph: Arc<Mutex<Graph>>) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "install".into(),
        "hermit install".into(),
        deps,
        Arc::new(Box::new(HermitExt::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    Ok(())
}
