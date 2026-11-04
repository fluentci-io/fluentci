import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Proto

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(proto: Proto) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(proto: Proto) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(proto: Proto) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(proto: Proto) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(proto: Proto, port: int, timeout: int) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(proto: Proto, cache: Cache) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(proto: Proto, name: String, value: String) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(proto: Proto, command: Array(String)) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(proto: Proto, name: String, secret: Secret) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(proto: Proto, service: Service) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(proto: Proto, path: String) -> Proto
