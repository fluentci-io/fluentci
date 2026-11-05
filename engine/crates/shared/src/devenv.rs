use extism::{convert::Json, *};
use fluentci_common::devenv::devenv as common_devenv;

use crate::state::State;

host_fn!(pub devenv(user_data: State;) -> Json<Devenv> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let devenv = common_devenv(graph, true)?;
    Ok(Json(devenv))
});
