use extism::{convert::Json, *};
use fluentci_common::flox::flox as common_flox;

use crate::state::State;

host_fn!(pub flox(user_data: State;) -> Json<Flox> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let flox = common_flox(graph, true)?;
    Ok(Json(flox))
});
