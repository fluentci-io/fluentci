use extism::{convert::Json, *};
use fluentci_common::directory::directory as common_directory;
use fluentci_common::directory::entries as common_entries;

use crate::state::State;

host_fn!(pub directory(user_data: State; path: String) -> Json<Directory> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let directory = common_directory(graph, path, true)?;

    Ok(Json(directory))
});

host_fn!(pub entries(user_data: State; path: String) -> Json<Vec<String>> {
    match common_entries(path) {
        Ok(entries) => Ok(Json(entries)),
        Err(err) => Err(err),
    }
});
