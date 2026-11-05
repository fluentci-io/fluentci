import fluentci/dagger/directory.{type Directory}
import fluentci/dagger/file.{type File}
import fluentci/dagger/secret.{type Secret}
import fluentci/dagger/service.{type Service}
import fluentci/dagger/socket.{type Socket}
import gleam/javascript/promise.{type Promise}

pub type Host

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(host: Host) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "directory")
pub fn directory(host: Host, path: String) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "file")
pub fn file(host: Host, path: String) -> File

@external(javascript, "../../dagger_ffi.mjs", "service")
pub fn service(host: Host) -> Service

@external(javascript, "../../dagger_ffi.mjs", "setSecretFile")
pub fn set_secret_file(host: Host, name: String, path: String) -> Secret

@external(javascript, "../../dagger_ffi.mjs", "tunnel")
pub fn tunnel(host: Host, service: Service) -> Service

@external(javascript, "../../dagger_ffi.mjs", "unixSocket")
pub fn unix_socket(host: Host, path: String) -> Socket
