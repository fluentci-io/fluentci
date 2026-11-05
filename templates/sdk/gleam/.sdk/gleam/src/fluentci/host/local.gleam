/// Direct Node/Deno host execution, with cooperative engine cancellation.
import fluentci/host
import fluentci/host/result as report
import gleam/javascript/promise.{type Promise}
import gleam/result

pub type Execution

pub type Progress {
  Auto
  Plain
  Tui
  Json
}

pub type Config {
  Config(binary: String, run_root: String, progress: Progress)
}

pub type LocalResult {
  LocalResult(run_directory: String, result: report.RunResult)
}

pub type Error {
  InvalidPlan(host.PlanError)
  TransportError(String)
  DecodeError
}

@external(javascript, "../../host_local_ffi.mjs", "start")
fn start_impl(
  encoded: String,
  binary: String,
  root: String,
  progress: String,
) -> Execution

@external(javascript, "../../host_local_ffi.mjs", "wait")
fn wait_impl(
  execution: Execution,
  ok: fn(String, String) -> Result(LocalResult, Error),
  error: fn(String) -> Result(LocalResult, Error),
) -> Promise(Result(LocalResult, Error))

@external(javascript, "../../host_local_ffi.mjs", "cancel")
pub fn cancel(execution: Execution) -> Promise(Nil)

pub fn start(plan: host.Plan, config: Config) -> Result(Execution, Error) {
  use encoded <- result.try(host.compile(plan) |> result.map_error(InvalidPlan))
  let progress = case config.progress {
    Auto -> "auto"
    Plain -> "plain"
    Tui -> "tui"
    Json -> "json"
  }
  Ok(start_impl(encoded, config.binary, config.run_root, progress))
}

pub fn wait(execution: Execution) -> Promise(Result(LocalResult, Error)) {
  wait_impl(
    execution,
    fn(directory, text) {
      report.parse(text)
      |> result.map_error(fn(_) { DecodeError })
      |> result.map(fn(result) { LocalResult(directory, result) })
    },
    fn(message) { Error(TransportError(message)) },
  )
}
