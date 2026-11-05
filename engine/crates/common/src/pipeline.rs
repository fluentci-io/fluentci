use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::runner::Runner;
use fluentci_types::pipeline::Pipeline;
use uuid::Uuid;

pub fn pipeline(graph: Arc<Mutex<Graph>>, name: String) -> Result<Pipeline, Error> {
    let mut graph = graph.lock().unwrap();
    graph.reset();
    graph.runner = Arc::new(Box::new(Runner::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        name,
        "".into(),
        vec![],
        Arc::new(Box::new(Runner::default())),
    ))?;

    let pipeline = Pipeline { id };
    Ok(pipeline)
}
