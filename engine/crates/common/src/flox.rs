use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::flox::Flox as FloxExt;
use fluentci_types::flox::Flox;
use uuid::Uuid;

pub fn flox(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Flox, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(FloxExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "flox".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(FloxExt::default())),
    ))?;

    let flox = Flox { id };
    Ok(flox)
}
