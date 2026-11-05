use extism::{convert::Json, *};
use fluentci_common::git::{
    branch as common_branch, commit as common_commit, git as common_git, tree as common_tree,
};
use fluentci_types::git::Git;

use crate::state::State;

host_fn!(pub git(user_data: State; url: String) -> Json<Git> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let git = common_git(graph, url, true)?;
    Ok(Json(Git::from(git)))
});

host_fn!(pub branch(user_data: State; name: String) {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_branch(graph, name)
});

host_fn!(pub commit(user_data: State;) -> String {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_commit(graph)
});

host_fn!(pub tree(user_data: State;) -> Json<Directory> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let directory = common_tree(graph)?;
    Ok(Json(directory))
});
