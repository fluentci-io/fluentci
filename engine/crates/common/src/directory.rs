use std::{
    fs::{canonicalize, metadata},
    path::Path,
    sync::{Arc, Mutex},
};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::runner::Runner;
use fluentci_types::directory::Directory;
use uuid::Uuid;

pub fn directory(graph: Arc<Mutex<Graph>>, path: String, reset: bool) -> Result<Directory, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(Runner::default()));

    let md = metadata(path.clone())?;
    if !md.is_dir() {
        return Err(Error::msg(format!("Path `{}` is not a directory", path)));
    }

    if !Path::new(&path).exists() && !path.starts_with("/") {
        let dir = canonicalize(".").unwrap();
        let dir = dir.to_str().unwrap();
        let dir = format!("{}/{}", dir, path);
        return Err(Error::msg(format!("Path `{}` does not exist", dir)));
    }

    graph.work_dir = path.clone();

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "directory".into(),
        "".into(),
        vec![],
        Arc::new(Box::new(Runner::default())),
    ))?;

    graph.execute(GraphCommand::AddVolume(
        id.clone(),
        "directory".into(),
        path.clone(),
    ))?;

    let path = canonicalize(path).unwrap().to_str().unwrap().to_string();
    let directory = Directory { id, path };
    Ok(directory)
}

pub fn entries(path: String) -> Result<Vec<String>, Error> {
    if !Path::new(&path).exists() {
        return Err(Error::msg(format!("Path `{}` does not exist", path)));
    }

    let entries = std::fs::read_dir(&path)
        .unwrap()
        .map(|res| res.unwrap().file_name().into_string().unwrap())
        .collect();
    Ok(entries)
}
