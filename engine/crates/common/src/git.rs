use std::{
    fs::{self},
    sync::{Arc, Mutex},
};

use anyhow::Error;
use fluentci_core::deps::{Graph, GraphCommand};
use fluentci_ext::git::Git as GitExt;
use fluentci_ext::git_checkout::GitCheckout as GitCheckoutExt;
use fluentci_ext::git_last_commit::GitLastCommit as GitLastCommitExt;
use fluentci_ext::runner::Runner as RunnerExt;
use fluentci_types::{directory::Directory, git::Git};
use uuid::Uuid;

use crate::util::{extract_git_repo, validate_git_url};

pub fn git(graph: Arc<Mutex<Graph>>, url: String, reset: bool) -> Result<Git, Error> {
    let mut graph = graph.lock().unwrap();

    if reset {
        graph.reset();
    }

    graph.runner = Arc::new(Box::new(GitExt::default()));
    graph.work_dir = format!(
        "{}/.fluentci/cache",
        dirs::home_dir().unwrap().to_str().unwrap()
    );

    if !validate_git_url(&url) {
        return Err(Error::msg("Invalid git url"));
    }
    let repo = extract_git_repo(&url);
    graph.work_dir = format!("{}/{}", graph.work_dir, repo);

    fs::create_dir_all(&graph.work_dir)?;

    let id = Uuid::new_v4().to_string();
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "git".into(),
        url.clone(),
        vec![],
        Arc::new(Box::new(GitExt::default())),
    ))?;
    graph.execute_vertex(&id)?;
    graph.work_dir = format!(
        "{}/{}",
        graph.work_dir,
        url.split("/").last().unwrap().replace(".git", "")
    );
    let git = Git { id };
    Ok(git)
}

pub fn branch(graph: Arc<Mutex<Graph>>, name: String) -> Result<(), Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(GitCheckoutExt::default()));

    let id = Uuid::new_v4().to_string();

    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "git-checkout".into(),
        name,
        deps,
        Arc::new(Box::new(GitCheckoutExt::default())),
    ))?;
    graph.execute_vertex(&id)?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }
    Ok(())
}

pub fn commit(graph: Arc<Mutex<Graph>>) -> Result<String, Error> {
    let mut graph = graph.lock().unwrap();
    graph.runner = Arc::new(Box::new(GitLastCommitExt::default()));

    let id = Uuid::new_v4().to_string();

    let dep_id = graph.vertices[graph.size() - 1].id.clone();
    let deps = match graph.size() {
        1 => vec![],
        _ => vec![dep_id],
    };
    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "git-last-commit".into(),
        "".into(),
        deps,
        Arc::new(Box::new(GitLastCommitExt::default())),
    ))?;

    if graph.size() > 2 {
        let x = graph.size() - 2;
        let y = graph.size() - 1;
        graph.execute(GraphCommand::AddEdge(x, y))?;
    }

    graph.execute_vertex(&id)
}

pub fn tree(graph: Arc<Mutex<Graph>>) -> Result<Directory, Error> {
    let id = Uuid::new_v4().to_string();
    let mut graph = graph.lock().unwrap();

    let dep_id = graph.vertices[graph.size() - 1].id.clone();

    graph.execute(GraphCommand::AddVertex(
        id.clone(),
        "tree".into(),
        "".into(),
        vec![dep_id],
        Arc::new(Box::new(RunnerExt::default())),
    ))?;

    let x = graph.size() - 2;
    let y = graph.size() - 1;
    graph.execute(GraphCommand::AddEdge(x, y))?;
    graph.runner = Arc::new(Box::new(RunnerExt::default()));

    let path = graph.work_dir.clone();

    graph.execute(GraphCommand::AddVolume(
        id.clone(),
        "directory".into(),
        path.clone(),
    ))?;

    let directory = Directory { id, path };

    Ok(directory)
}
