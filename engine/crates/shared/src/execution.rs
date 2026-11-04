//! A complete plan is one guest effect: matrix members never share a mutable graph.
use crate::state::State;
use extism::*;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    plan: fluentci_executor::Plan,
    run_dir: PathBuf,
}

host_fn!(pub execute_plan(user_data: State; request: String) -> String {
    let mut request: Request = serde_json::from_str(&request)?;
    let base = std::env::current_dir()?;
    request.plan.resolve_paths(&base).map_err(Error::msg)?;
    if request.run_dir.as_os_str().is_empty() { return Err(Error::msg("run_dir must name a fresh directory")); }
    if request.run_dir.is_relative() { request.run_dir = base.join(&request.run_dir); }
    let cancellation = {
        let state = user_data.get()?;
        let state = state.lock().unwrap();
        let graph = state.graph.lock().unwrap();
        graph.cancellation.clone()
    };
    let report = fluentci_core::execute_plan(&request.plan, &request.run_dir, &cancellation)?;
    if let Some(failure) = report.failure() {
        let state = user_data.get()?;
        let state = state.lock().unwrap();
        *state.execution_failure.lock().unwrap() = Some(failure);
    }
    Ok(serde_json::to_string(&report)?)
});
