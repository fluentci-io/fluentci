use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::pixi::Pixi as PixiExt;
use fluentci_types::pixi::Pixi;
use uuid::Uuid;

pub fn pixi(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Pixi, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(PixiExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "pixi".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(PixiExt::default())),
    ))?;

    let pixi = Pixi { id };
    Ok(pixi)
}
