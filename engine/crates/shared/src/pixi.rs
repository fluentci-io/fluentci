use extism::{convert::Json, *};
use fluentci_common::pixi::pixi as common_pixi;

use crate::state::State;

host_fn!(pub pixi(user_data: State;) -> Json<Pixi> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let pixi = common_pixi(graph, true)?;
    Ok(Json(pixi))
});
