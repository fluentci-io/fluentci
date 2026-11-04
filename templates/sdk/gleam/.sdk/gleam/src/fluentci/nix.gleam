import fluentci/cache.{type Cache}
import fluentci/secret.{type Secret}
import fluentci/service.{type Service}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Nix

@external(javascript, "../fluentci_ffi.mjs", "asService")
pub fn as_service(nix: Nix) -> Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(nix: Nix) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(nix: Nix) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(nix: Nix) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(nix: Nix, port: int, timeout: int) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(nix: Nix, cache: Cache) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(nix: Nix, name: String, value: String) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(nix: Nix, command: Array(String)) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(nix: Nix, name: String, secret: Secret) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(nix: Nix, service: Service) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(nix: Nix, path: String) -> Nix
