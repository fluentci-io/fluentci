use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::nix::Nix as NixExt;
use fluentci_types::nix::{Nix, NixArgs};
use uuid::Uuid;

pub fn nix(graph: Arc<Mutex<Graph>>, reset: bool, args: NixArgs) -> Result<Nix, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(NixExt::new(args)));

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "nix".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(NixExt::default())),
    ))?;

    let nix = Nix { id };
    Ok(nix)
}
