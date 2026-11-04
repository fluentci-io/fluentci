use extism::{convert::Json, *};
use fluentci_common::envhub::envhub as common_envhub;

use crate::state::State;

host_fn!(pub envhub(user_data: State;) -> Json<Envhub> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let envhub = common_envhub(graph, true)?;
    Ok(Json(envhub))
});
