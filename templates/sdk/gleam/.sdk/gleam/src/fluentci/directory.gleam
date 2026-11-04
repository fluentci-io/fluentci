import fluentci/cache.{type Cache}
import fluentci/devbox.{type Devbox}
import fluentci/devenv.{type Devenv}
import fluentci/flox.{type Flox}
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

pub type Directory

@external(javascript, "../fluentci_ffi.mjs", "devbox")
pub fn devbox(d: Directory) -> Devbox

@external(javascript, "../fluentci_ffi.mjs", "devenv")
pub fn devenv(d: Directory) -> Devenv

@external(javascript, "../fluentci_ffi.mjs", "entries")
pub fn entries(d: Directory) -> Promise(Array(String))

@external(javascript, "../fluentci_ffi.mjs", "flox")
pub fn flox(d: Directory) -> Flox

@external(javascript, "../fluentci_ffi.mjs", "mise")
pub fn mise(d: Directory) -> Mise

@external(javascript, "../fluentci_ffi.mjs", "nix")
pub fn nix(d: Directory) -> Nix

@external(javascript, "../fluentci_ffi.mjs", "pixi")
pub fn pixi(d: Directory) -> Pixi

@external(javascript, "../fluentci_ffi.mjs", "pkgx")
pub fn pkgx(d: Directory) -> Pkgx

@external(javascript, "../fluentci_ffi.mjs", "proto")
pub fn proto(d: Directory) -> Proto

@external(javascript, "../fluentci_ffi.mjs", "hermit")
pub fn hermit(d: Directory) -> Hermit

@external(javascript, "../fluentci_ffi.mjs", "directory")
pub fn directory(d: Directory, path: String) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "stderr")
pub fn stderr(d: Directory) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "stdout")
pub fn stdout(d: Directory) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "waitOn")
pub fn wait_on(d: Directory, port: int, timeout: int) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withCache")
pub fn with_cache(d: Directory, cache: Cache) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withEnvVariable")
pub fn with_env_variable(d: Directory, name: String, value: String) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withExec")
pub fn with_exec(d: Directory, command: Array(String)) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withSecretVariable")
pub fn with_secret_variable(
  d: Directory,
  name: String,
  secret: Secret,
) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withService")
pub fn with_service(d: Directory, service: Service) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withWorkdir")
pub fn with_workdir(d: Directory, path: String) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "withFile")
pub fn with_file(d: Directory, file_id: String) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "zip")
pub fn zip(d: Directory) -> File

@external(javascript, "../fluentci_ffi.mjs", "tarCzvf")
pub fn tar_czvf(d: Directory) -> File

pub type File
