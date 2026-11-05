import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Pkgx

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(pkgx: Pkgx) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(pkgx: Pkgx) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(pkgx: Pkgx) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(pkgx: Pkgx) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(pkgx: Pkgx, port: int, timeout: int) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(pkgx: Pkgx, cache: Cache) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(pkgx: Pkgx, name: String, value: String) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(pkgx: Pkgx, command: Array(String)) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(pkgx: Pkgx, name: String, secret: Secret) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withPackages")
pub fn with_packages(pkgx: Pkgx, packages: Array(String)) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(pkgx: Pkgx, service: Service) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(pkgx: Pkgx, path: String) -> Pkgx
