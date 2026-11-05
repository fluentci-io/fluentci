import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Devenv

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(devenv: Devenv) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(devenv: Devenv) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(devenv: Devenv) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(devenv: Devenv) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(devenv: Devenv, port: int, timeout: int) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(devenv: Devenv, cache: Cache) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(devenv: Devenv, name: String, value: String) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(devenv: Devenv, command: Array(String)) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(
  devenv: Devenv,
  name: String,
  secret: Secret,
) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(devenv: Devenv, service: Service) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(devenv: Devenv, path: String) -> Devenv
