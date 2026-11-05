use extism::{convert::Json, *};
use fluentci_common::devbox::devbox as common_devbox;

use crate::state::State;

host_fn!(pub devbox(user_data: State;) -> Json<Devbox> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let devbox = common_devbox(graph, true)?;
    Ok(Json(devbox))
});
