use extism::{convert::Json, *};
use fluentci_common::pipeline::pipeline as common_pipeline;

use crate::state::State;

host_fn!(pub pipeline(user_data: State; name: String) -> Json<Pipeline> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let pipeline = common_pipeline(graph, name)?;
    Ok(Json(pipeline))
});
