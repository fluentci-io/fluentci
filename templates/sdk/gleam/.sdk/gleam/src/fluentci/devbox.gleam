import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Devbox

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(devbox: Devbox) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(devbox: Devbox) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(devbox: Devbox) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(devbox: Devbox) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(devbox: Devbox, port: int, timeout: int) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(devbox: Devbox, cache: Cache) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(devbox: Devbox, name: String, value: String) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(devbox: Devbox, command: Array(String)) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(
  devbox: Devbox,
  name: String,
  secret: Secret,
) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(devbox: Devbox, service: Service) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(devbox: Devbox, path: String) -> Devbox
