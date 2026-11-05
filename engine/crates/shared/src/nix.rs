use extism::{convert::Json, *};
use fluentci_common::nix::nix as common_nix;
use fluentci_types::nix::NixArgs;

use crate::state::State;

host_fn!(pub nix(user_data: State; args: Json<NixArgs>) -> Json<Nix> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let args = args.into_inner();
    let nix = common_nix(graph, true, args)?;
    Ok(Json(nix))
});
