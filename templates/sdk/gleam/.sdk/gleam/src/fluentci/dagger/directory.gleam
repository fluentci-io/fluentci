import fluentci/dagger/container.{type Container}
import fluentci/dagger/file.{type File}
import fluentci/dagger/module.{type Module}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Directory

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(directory: Directory) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "asModule")
pub fn as_module(directory: Directory) -> Module

@external(javascript, "../../dagger_ffi.mjs", "diff")
pub fn diff(directory: Directory, other: Directory) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "directory")
pub fn directory(d: Directory, path: String) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "dockerBuild")
pub fn docker_build(directory: Directory) -> Container

@external(javascript, "../../dagger_ffi.mjs", "entries")
pub fn entries(directory: Directory) -> Promise(Array(String))

@external(javascript, "../../dagger_ffi.mjs", "export_")
pub fn export(directory: Directory, path: String) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "file")
pub fn file(directory: Directory, path: String) -> File

@external(javascript, "../../dagger_ffi.mjs", "glob")
pub fn glob(directory: Directory, pattern: String) -> Promise(Array(String))

@external(javascript, "../../dagger_ffi.mjs", "pipeline")
pub fn pipeline(directory: Directory, name: String) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "sync")
pub fn sync(directory: Directory) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "terminal")
pub fn terminal(directory: Directory) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withDirectory")
pub fn with_directory(
  d: Directory,
  path: String,
  directory: Directory,
) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withFile")
pub fn with_file(d: Directory, source: File) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withFiles")
pub fn with_files(d: Directory, sources: Array(File)) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withNewDirectory")
pub fn with_new_directory(d: Directory, path: String) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withNewFile")
pub fn with_new_file(d: Directory, path: String, contents: String) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withTimestamps")
pub fn with_timestamps(d: Directory, timestamp: Int) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withoutDirectory")
pub fn without_directory(d: Directory, path: String) -> Directory

@external(javascript, "../../dagger_ffi.mjs", "withoutFile")
pub fn without_file(d: Directory, path: String) -> Directory
