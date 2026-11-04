use crate::state::State;
use extism::{convert::Json, *};
use fluentci_common::http::http as common_http;

host_fn!(pub http(user_data: State; url: String) -> Json<File> {
  let state = user_data.get()?;
  let state = state.lock().unwrap();
  let graph = state.graph.clone();
  let file = common_http(graph, url, true)?;
    Ok(Json(file))
});
