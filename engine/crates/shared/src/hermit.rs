use extism::{convert::Json, *};
use fluentci_common::hermit as common_hermit;

use crate::state::State;

host_fn!(pub hermit(user_data: State;) -> Json<Hermit> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();

    let hermit = common_hermit::hermit(graph, true)?;
    Ok(Json(hermit))
});

host_fn!(pub install(user_data: State;) {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_hermit::install(graph)?;
    Ok(())
});
