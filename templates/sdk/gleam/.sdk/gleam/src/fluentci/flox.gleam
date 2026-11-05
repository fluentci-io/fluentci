import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Flox

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(flox: Flox) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(flox: Flox) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(flox: Flox) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(flox: Flox) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(flox: Flox, port: int, timeout: int) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(flox: Flox, cache: Cache) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(flox: Flox, name: String, value: String) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(flox: Flox, command: Array(String)) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(flox: Flox, name: String, secret: Secret) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(flox: Flox, service: Service) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(flox: Flox, path: String) -> Flox
