use extism::{convert::Json, *};
use fluentci_common::proto::proto as common_proto;

use crate::state::State;

host_fn!(pub proto(user_data: State;) -> Json<Proto> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let proto = common_proto(graph, true)?;
    Ok(Json(proto))
});
