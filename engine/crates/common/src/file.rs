use std::{
    fs::metadata,
    path::Path,
    sync::{Arc, Mutex},
};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::archive::tar::xzvf::TarXzvf as TarXzvfExt;
use fluentci_ext::archive::unzip::Unzip as UnzipExt;
use fluentci_ext::hash::md5::Md5 as Md5Ext;
use fluentci_ext::hash::sha256::Sha256 as Sha256Ext;
use fluentci_ext::runner::Runner;
use fluentci_types::{directory::Directory, file::File};
use uuid::Uuid;

pub fn file(graph: Arc<Mutex<Graph>>, path: String, reset: bool) -> Result<File, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(Runner::default()));

    let id = Uuid::new_v4().to_string();

    let md = metadata(path.clone())?;
    if !md.is_file() {
        return Err(Error::msg(format!("Path `{}` is not a file", path)));
    }

    if !Path::new(&path).exists() {
        return Err(Error::msg(format!("File `{}` does not exist", path)));
    }

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "file".into(),
        path.clone(),
        vec![],
        Arc::new(Box::new(Runner::default())),
    ))?;

    graph.execute(GraphCommand::AddVolume(
        id.clone(),
        "file".into(),
        path.clone(),
    ))?;

    let file = File { id, path };
    Ok(file)
}

pub fn md5(graph: Arc<Mutex<Graph>>, path: String) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(Md5Ext::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "md5".into(),
        path.clone(),
        vec![dep_id],
        Arc::new(Box::new(Md5Ext::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    let hash = graph.execute_vertex(&id)?;
    Ok(hash)
}

pub fn sha256(graph: Arc<Mutex<Graph>>, path: String) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(Sha256Ext::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "sha256".into(),
        path.clone(),
        vec![dep_id],
        Arc::new(Box::new(Sha256Ext::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    let hash = graph.execute_vertex(&id)?;
    Ok(hash)
}

pub fn tar_xzvf(
    graph: Arc<Mutex<Graph>>,
    path: String,
    output_dir: Option<String>,
) -> Result<Directory, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(TarXzvfExt::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "tar xzvf".into(),
        path.clone(),
        vec![dep_id],
        Arc::new(Box::new(TarXzvfExt::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    let output_dir = match output_dir {
        Some(dir) => dir,
        None => ".".into(),
    };

    graph.environment.insert(
        "FLUENTCI_TAR_XZVF_OUTPUT_DIRECTORY".into(),
        output_dir.clone(),
    );

    graph.execute_vertex(&id)?;

    let parent_dir = path.split('/').collect::<Vec<&str>>();
    let parent_dir = parent_dir[..parent_dir.len() - 1].join("/");

    let dir = Directory {
        id: id.clone(),
        path: format!("{}/{}", parent_dir, output_dir),
    };

    graph.execute(GraphCommand::AddVolume(
        id,
        "directory".into(),
        dir.path.clone(),
    ))?;

    Ok(dir)
}

pub fn unzip(
    graph: Arc<Mutex<Graph>>,
    path: String,
    output_dir: Option<String>,
) -> Result<Directory, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(UnzipExt::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "unzip".into(),
        path.clone(),
        vec![dep_id],
        Arc::new(Box::new(UnzipExt::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    let output_dir = match output_dir {
        Some(dir) => dir,
        None => ".".into(),
    };

    graph
        .environment
        .insert("FLUENTCI_UNZIP_OUTPUT_DIRECTORY".into(), output_dir.clone());

    graph.execute_vertex(&id)?;

    let parent_dir = path.split('/').collect::<Vec<&str>>();
    let parent_dir = parent_dir[..parent_dir.len() - 1].join("/");

    let dir = Directory {
        id: id.clone(),
        path: format!("{}/{}", parent_dir, output_dir),
    };

    graph.execute(GraphCommand::AddVolume(
        id,
        "directory".into(),
        dir.path.clone(),
    ))?;

    Ok(dir)
}

pub fn chmod(graph: Arc<Mutex<Graph>>, path: String, mode: String) -> Result<File, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(Runner::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "chmod".into(),
        format!("chmod {} {}", mode, path),
        vec![dep_id],
        Arc::new(Box::new(Runner::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    graph.execute_vertex(&id)?;

    let file = File { id, path };
    Ok(file)
}
