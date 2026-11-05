use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::devbox::Devbox as DevboxExt;
use fluentci_types::devbox::Devbox;
use uuid::Uuid;

pub fn devbox(graph: Arc<Mutex<Graph>>, reset: bool) -> Result<Devbox, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(DevboxExt::default()));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "devbox".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(DevboxExt::default())),
    ))?;

    let devbox = Devbox { id };
    Ok(devbox)
}
