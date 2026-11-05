import fluentci/cache.{type Cache}
import fluentci/devbox.{type Devbox}
import fluentci/devenv.{type Devenv}
import fluentci/envhub.{type Envhub}
import fluentci/hermit.{type Hermit}
import fluentci/mise.{type Mise}
import fluentci/nix.{type Nix}
import fluentci/pixi.{type Pixi}
import fluentci/pkgx.{type Pkgx}
import fluentci/proto.{type Proto}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Pipeline

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(pipeline: Pipeline) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(pipeline: Pipeline) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "devbox")
pub fn devbox(pipeline: Pipeline) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "devenv")
pub fn devenv(pipeline: Pipeline) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "envhub")
pub fn envhub(pipeline: Pipeline) -> Envhub

@external(javascript, "../fluentci_ffi.mjs", "mise")
pub fn mise(pipeline: Pipeline) -> Mise

@external(javascript, "../fluentci_ffi.mjs", "nix")
pub fn nix(pipeline: Pipeline) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "pixi")
pub fn pixi(pipeline: Pipeline) -> Pixi

@external(javascript, "../fluentci_ffi.mjs", "pkgx")
pub fn pkgx(pipeline: Pipeline) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "proto")
pub fn proto(pipeline: Pipeline) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "hermit")
pub fn hermit(pipeline: Pipeline) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(pipeline: Pipeline) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(pipeline: Pipeline) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(pipeline: Pipeline, port: int, timeout: int) -> Pipeline

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(pipeline: Pipeline, cache: Cache) -> Pipeline

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(
  pipeline: Pipeline,
  name: String,
  value: String,
) -> Pipeline

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(pipeline: Pipeline, command: Array(String)) -> Pipeline

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(
  pipeline: Pipeline,
  name: String,
  secret: Secret,
) -> Pipeline

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(pipeline: Pipeline, service: Service) -> Pipeline

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(pipeline: Pipeline, path: String) -> Pipeline
