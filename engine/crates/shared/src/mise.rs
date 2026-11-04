use extism::{convert::Json, *};
use fluentci_common::mise as common_mise;

use crate::state::State;

host_fn!(pub mise(user_data: State;) -> Json<Mise> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let mise = common_mise::mise(graph, true)?;
    Ok(Json(mise))
});

host_fn!(pub trust(user_data: State;) {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    common_mise::trust(graph)?;
    Ok(())
});
