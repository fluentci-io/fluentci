import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Hermit

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(hermit: Hermit) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(hermit: Hermit) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "install")
pub fn install(hermit: Hermit) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(hermit: Hermit) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(hermit: Hermit) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(hermit: Hermit, port: int, timeout: int) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(hermit: Hermit, cache: Cache) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(hermit: Hermit, name: String, value: String) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(hermit: Hermit, command: Array(String)) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(
  hermit: Hermit,
  name: String,
  secret: Secret,
) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withPackages")
pub fn with_packages(hermit: Hermit, packages: Array(String)) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(hermit: Hermit, service: Service) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(hermit: Hermit, path: String) -> Hermit
