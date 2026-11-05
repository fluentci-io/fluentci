use std::{
    fs,
    sync::{Arc, Mutex},
};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::http::Http as HttpExt;
use fluentci_types::file::File;
use uuid::Uuid;

pub fn http(graph: Arc<Mutex<Graph>>, url: String, reset: bool) -> Result<File, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(HttpExt::default()));
    graph.work_dir = format!(
        "{}/.fluentci/cache",
        dirs::home_dir().unwrap().to_str().unwrap()
    );
    fs::create_dir_all(&graph.work_dir)?;

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "http".into(),
        url.clone(),
        vec![],
        Arc::new(Box::new(HttpExt::default())),
    ))?;
    graph.execute_vertex(&id)?;

    let id = Uuid::new_v4().to_string();
    let filename = sha256::digest(url).to_string();
    let work_dir = graph.work_dir.clone();

    let file = File {
        id: id.clone(),
        path: format!("{}/{}", work_dir, filename),
    };

    graph.execute(GraphCommand::AddVolume(
        id,
        "file".into(),
        file.path.clone(),
    ))?;

    Ok(file)
}
