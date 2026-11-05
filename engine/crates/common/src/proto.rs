use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::proto::Proto as ProtoExt;
use fluentci_types::proto::Proto;
use uuid::Uuid;

pub fn proto(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Proto, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(ProtoExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "proto".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(ProtoExt::default())),
    ))?;

    let proto = Proto { id };
    Ok(proto)
}
