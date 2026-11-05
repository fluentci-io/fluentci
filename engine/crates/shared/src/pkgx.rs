use extism::{convert::Json, *};
use fluentci_common::pkgx as common_pkgx;

use crate::state::State;

host_fn!(pub pkgx(user_data: State;) -> Json<Pkgx> {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let pkgx = common_pkgx::pkgx(graph, true)?;
    Ok(Json(pkgx))
});

host_fn!(pub with_packages(user_data: State; packages: Json<Vec<String>>) {
    let state = user_data.get()?;
    let state = state.lock().unwrap();
    let graph = state.graph.clone();
    let packages = packages.into_inner();
    common_pkgx::with_packages(graph, packages)?;
    Ok(())
});
