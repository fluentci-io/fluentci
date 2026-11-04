use extism::{convert::Json, *};
use fluentci_common::cache::cache as common_cache;

use crate::state::State;

host_fn!(pub cache(user_data: State; key: String) -> Json<Cache> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let cache = common_cache(graph, &key)?;
    Ok(Json(cache))
});
