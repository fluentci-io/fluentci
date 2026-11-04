use std::sync::{Arc, Mutex};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::cache::Cache as CacheExt;
use fluentci_types::cache::Cache;
use uuid::Uuid;

pub fn cache(graph: Arc<Mutex<Graph>>, key: &str) -> Result<Cache, Error> {
    let mut graph = graph.lock().unwrap();
    graph.reset();

    let cache = graph
        .volumes
        .iter()
        .find(|v| v.label == "cache" && v.key == key);

    if let Some(cache) = cache {
        return Ok(Cache {
            id: cache.id.clone(),
            key: cache.key.clone(),
            path: "".into(),
        });
    }

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "cache".into(),
        key.into(),
        vec![],
        Arc::new(Box::new(CacheExt::default())),
    ))?;

    graph.execute(GraphCommand::AddVolume(
        id.clone(),
        "cache".into(),
        key.into(),
    ))?;

    let cache = Cache {
        id,
        key: key.into(),
        path: "".into(),
    };
    Ok(cache)
}
