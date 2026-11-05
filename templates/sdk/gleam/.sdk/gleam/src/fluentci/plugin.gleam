//// Guest-only FluentCI plugin primitives. Values are immutable; stdout/stderr
//// invoke the engine's exposed PDK functions from inside an Extism Wasm plugin.

import gleam/list

pub type Step

pub opaque type Pipeline {
  Pipeline(name: String, steps: List(Step))
}

pub opaque type Service {
  Service(name: String, pipeline: Pipeline)
}

pub type Provider {
  Nix(impure: Bool)
  Flox
  Devbox
  Devenv
  Envhub
  Hermit
  Mise
  Pixi
  Pkgx
}

pub fn pipeline(name: String) -> Pipeline {
  Pipeline(name, [])
}

pub fn exec(
  pipeline: Pipeline,
  program: String,
  arguments: List(String),
) -> Pipeline {
  Pipeline(..pipeline, steps: [exec_step(program, arguments), ..pipeline.steps])
}

pub fn shell(pipeline: Pipeline, command: String) -> Pipeline {
  Pipeline(..pipeline, steps: [shell_step(command), ..pipeline.steps])
}

pub fn workdir(pipeline: Pipeline, path: String) -> Pipeline {
  Pipeline(..pipeline, steps: [workdir_step(path), ..pipeline.steps])
}

pub fn env(pipeline: Pipeline, key: String, value: String) -> Pipeline {
  Pipeline(..pipeline, steps: [env_step(key, value), ..pipeline.steps])
}

pub fn cache(pipeline: Pipeline, key: String, path: String) -> Pipeline {
  Pipeline(..pipeline, steps: [cache_step(key, path), ..pipeline.steps])
}

pub fn using(pipeline: Pipeline, provider: Provider) -> Pipeline {
  let step = case provider {
    Nix(impure) -> provider_step("nix", impure)
    Flox -> provider_step("flox", False)
    Devbox -> provider_step("devbox", False)
    Devenv -> provider_step("devenv", False)
    Envhub -> provider_step("envhub", False)
    Hermit -> provider_step("hermit", False)
    Mise -> provider_step("mise", False)
    Pixi -> provider_step("pixi", False)
    Pkgx -> provider_step("pkgx", False)
  }
  Pipeline(..pipeline, steps: [step, ..pipeline.steps])
}

pub fn as_service(pipeline: Pipeline, name: String) -> Service {
  Service(name, pipeline)
}

pub fn with_service(pipeline: Pipeline, service: Service) -> Pipeline {
  let Service(name, source) = service
  let step = service_step(name, source.name, list.reverse(source.steps))
  Pipeline(..pipeline, steps: [step, ..pipeline.steps])
}

pub fn stdout(pipeline: Pipeline) -> Result(String, String) {
  run(pipeline.name, list.reverse(pipeline.steps), False, Ok, Error)
}

pub fn stderr(pipeline: Pipeline) -> Result(String, String) {
  run(pipeline.name, list.reverse(pipeline.steps), True, Ok, Error)
}

@external(javascript, "../plugin_ffi.mjs", "exec_step")
fn exec_step(program: String, arguments: List(String)) -> Step

@external(javascript, "../plugin_ffi.mjs", "shell_step")
fn shell_step(command: String) -> Step

@external(javascript, "../plugin_ffi.mjs", "workdir_step")
fn workdir_step(path: String) -> Step

@external(javascript, "../plugin_ffi.mjs", "env_step")
fn env_step(key: String, value: String) -> Step

@external(javascript, "../plugin_ffi.mjs", "cache_step")
fn cache_step(key: String, path: String) -> Step

@external(javascript, "../plugin_ffi.mjs", "provider_step")
fn provider_step(name: String, impure: Bool) -> Step

@external(javascript, "../plugin_ffi.mjs", "service_step")
fn service_step(name: String, source: String, steps: List(Step)) -> Step

@external(javascript, "../plugin_ffi.mjs", "run")
fn run(
  name: String,
  steps: List(Step),
  stderr: Bool,
  ok: fn(String) -> Result(String, String),
  error: fn(String) -> Result(String, String),
) -> Result(String, String)
