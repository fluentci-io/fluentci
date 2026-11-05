use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::pkgx::Pkgx as PkgxExt;
use fluentci_types::pkgx::Pkgx;
use uuid::Uuid;

pub fn pkgx(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Pkgx, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(PkgxExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "pkgx".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(PkgxExt::default())),
    ))?;

    let pkgx = Pkgx { id };
    Ok(pkgx)
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
        format!("pkgm install {}", packages.join(" ")),
        deps,
        Arc::new(Box::new(PkgxExt::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    Ok(())
}
