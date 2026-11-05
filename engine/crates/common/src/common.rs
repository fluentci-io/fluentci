use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::cache::Cache as CacheExt;
use fluentci_ext::Extension;
use fluentci_ext::{archive::tar::czvf::TarCzvf as TarCzvfExt, runner::Runner};
use fluentci_ext::{archive::zip::Zip as ZipExt, pkgx::Pkgx as PkgxExt};
use fluentci_secrets::Provider;
use fluentci_types::{file::File, secret::Secret, service::Service, Output};
use std::{
    fs::canonicalize,
    path::Path,
    sync::{mpsc::Receiver, Arc, Mutex},
};
use uuid::Uuid;

pub fn with_exec(
    graph: Arc<Mutex<Graph>>,
    args: Vec<String>,
    ext: Arc<Box<dyn Extension + Send + Sync>>,
) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "exec".into(),
        args.join(" "),
        deps,
        ext,
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }
    Ok(())
}

pub fn with_workdir(
    graph: Arc<Mutex<Graph>>,
    path: String,
    ext: Arc<Box<dyn Extension + Send + Sync>>,
) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();

    if !Path::new(&path).exists() && !path.starts_with("/") {
        let dir = canonicalize(".").unwrap();
        let dir = dir.to_str().unwrap();
        let dir = format!("{}/{}", dir, path);
        return Err(Error::msg(format!("Path `{}` does not exist", dir)));
    }

    if !Path::new(&path).exists() {
        return Err(Error::msg(format!("Path `{}` does not exist", path)));
    }

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "withWorkdir".into(),
        path,
        deps,
        ext,
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    graph.execute_vertex(&id)?;

    Ok(())
}

pub fn with_cache(graph: Arc<Mutex<Graph>>, cache_id: String, path: String) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    let runner = graph.runner.clone();
    graph.runner = Arc::new(Box::new(CacheExt::default()));

    if let Some(cache) = graph.volumes.iter().find(|v| v.id.clone() == cache_id) {
        let id = Uuid::new_v4().to_string();
        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        let cache_key_path = format!("{}:{}", cache.path, path);
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "withCache".into(),
            cache_key_path,
            deps,
            Arc::new(Box::new(CacheExt::default())),
        ))?;

        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;

        graph.execute_vertex(&id)?;
        graph.runner = runner;
        return Ok(());
    }

    Err(Error::msg("Cache not found"))
}

pub fn with_file(graph: Arc<Mutex<Graph>>, file_id: String, path: String) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    let runner = graph.runner.clone();
    graph.runner = Arc::new(Box::new(Runner::default()));

    if let Some(file) = graph.volumes.iter().find(|v| v.id.clone() == file_id) {
        let id = Uuid::new_v4().to_string();
        let dep_id = graph.vertices[graph.size() - 1].id.clone();
        let deps = match graph.size() {
            1 => vec![],
            _ => vec![dep_id],
        };
        let copy_file = format!("cp {} {}", file.path, path);
        graph.execute(GraphCommand::AddVertex(
            id.clone(),
            "withFile".into(),
            copy_file,
            deps,
            Arc::new(Box::new(Runner::default())),
        ))?;

        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;

        graph.execute_vertex(&id)?;

        graph.runner = runner;
        return Ok(());
    }

    Err(Error::msg("File not found"))
}

pub fn stdout(
    graph: Arc<Mutex<Graph>>,
    rx: Arc<Mutex<Receiver<(String, usize)>>>,
) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    graph.execute(GraphCommand::Execute(Output::Stdout))?;
    let rx = rx.lock().unwrap();
    let (stdout, code) = rx.recv().unwrap();

    if code != 0 {
        return Err(fluentci_core::ExecutionFailure {
            exit_code: i32::try_from(code).unwrap_or(1),
            message: format!("Failed to execute command (exit code {code}): {stdout}"),
        }
        .into());
    }
    Ok(stdout)
}

pub fn stderr(
    graph: Arc<Mutex<Graph>>,
    rx: Arc<Mutex<Receiver<(String, usize)>>>,
) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    graph.execute(GraphCommand::Execute(Output::Stderr))?;
    let rx = rx.lock().unwrap();
    let (stderr, code) = rx.recv().unwrap();

    if code != 0 {
        return Err(fluentci_core::ExecutionFailure {
            exit_code: i32::try_from(code).unwrap_or(1),
            message: format!("Failed to execute command (exit code {code}): {stderr}"),
        }
        .into());
    }

    Ok(stderr)
}

pub fn zip(graph: Arc<Mutex<Graph>>, path: String) -> Result<File, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(ZipExt::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "zip".into(),
        path.clone(),
        vec![dep_id],
        Arc::new(Box::new(ZipExt::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    graph.execute_vertex(&id)?;

    let output_file = match path.split('/').next_back() {
        Some(file) => format!("{}.zip", file),
        None => format!("{}.zip", path),
    };

    let parent_dir = path.split('/').collect::<Vec<&str>>();
    let parent_dir = parent_dir[..parent_dir.len() - 1].join("/");

    let id = Uuid::new_v4().to_string();
    let file = File {
        id: id.clone(),
        path: format!("{}/{}", parent_dir, output_file),
    };

    graph.execute(GraphCommand::AddVolume(
        id,
        "file".into(),
        file.path.clone(),
    ))?;

    Ok(file)
}

pub fn tar_czvf(graph: Arc<Mutex<Graph>>, path: String) -> Result<File, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(TarCzvfExt::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "tar czvf".into(),
        path.clone(),
        vec![dep_id],
        Arc::new(Box::new(TarCzvfExt::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;

    graph.execute_vertex(&id)?;

    let output_file = match path.split('/').next_back() {
        Some(file) => format!("{}.tar.gz", file),
        None => format!("{}.tar.gz", path),
    };

    let parent_dir = path.split('/').collect::<Vec<&str>>();
    let parent_dir = parent_dir[..parent_dir.len() - 1].join("/");

    let id = Uuid::new_v4().to_string();
    let file = File {
        id: id.clone(),
        path: format!("{}/{}", parent_dir, output_file),
    };

    graph.execute(GraphCommand::AddVolume(
        id,
        "file".into(),
        file.path.clone(),
    ))?;

    Ok(file)
}

pub fn as_service(graph: Arc<Mutex<Graph>>, name: String) -> Result<Service, Error> {
    let mut graph = graph.lock().unwrap();
    let runner = graph.runner.clone();
    graph.runner = Arc::new(Box::new(Runner::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "asService".into(),
        name,
        deps,
        Arc::new(Box::new(Runner::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;

        graph.register_service(&id)?;
    }

    let service = Service { id: id.clone() };

    graph.runner = runner;
    Ok(service)
}

pub fn with_service(graph: Arc<Mutex<Graph>>, service_id: String) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    match graph.services.iter().find(|s| s.id == service_id) {
        Some(_) => {
            graph.execute(GraphCommand::EnableService(service_id.clone()))?;
            Ok(())
        }
        None => Err(Error::msg("Service not found")),
    }
}

pub fn with_env_variable(graph: Arc<Mutex<Graph>>, key: &str, value: &str) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    graph.execute(GraphCommand::AddEnvVariable(key.into(), value.into()))?;
    Ok(())
}

pub fn wait_on(graph: Arc<Mutex<Graph>>, port: u32, timeout: Option<u32>) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    let runner = graph.runner.clone();
    graph.runner = Arc::new(Box::new(PkgxExt::default()));

    let id = Uuid::new_v4().to_string();
    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    let cmd = format!(
        "pkgx deno run -A npm:wait-port localhost:{} -t {}",
        port,
        timeout.unwrap_or(60) * 1000
    );
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "waitOn".into(),
        cmd,
        deps,
        Arc::new(Box::new(PkgxExt::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    graph.runner = runner;
    Ok(())
}

pub fn add_secretmanager(graph: Arc<Mutex<Graph>>, provider: Provider) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddSecretManager(id.clone(), provider))?;
    Ok(id)
}

pub fn get_secret(
    graph: Arc<Mutex<Graph>>,
    secret_manager_id: &str,
    name: &str,
) -> Result<Vec<Secret>, Error> {
    let mut graph = graph.lock().unwrap();
    let secret = graph.get_secret(secret_manager_id, name.to_string())?;
    Ok(secret)
}

pub fn with_secret_variable(
    graph: Arc<Mutex<Graph>>,
    env_name: &str,
    secret_id: &str,
    secret_name: &str,
) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    graph.execute(GraphCommand::AddSecretVariable(
        env_name.into(),
        secret_id.into(),
        secret_name.into(),
    ))?;
    Ok(())
}

pub fn set_secret(graph: Arc<Mutex<Graph>>, name: &str, value: &str) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    let id = graph.set_secret(name.into(), value.into())?;
    Ok(id)
}

pub fn get_secret_plaintext(
    graph: Arc<Mutex<Graph>>,
    secret_id: &str,
    name: &str,
) -> Result<String, Error> {
    let graph = graph.lock().unwrap();
    let secret = graph.get_secret_plaintext(secret_id.into(), name.into())?;
    Ok(secret)
}
