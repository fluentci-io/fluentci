import fluentci/directory.{type Directory, type File}
import gleam/javascript/promise.{type Promise}

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(f: File) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "chmod")
pub fn chmod(f: File, mode: int) -> Promise(File)

@external(javascript, "../fluentci_ffi.mjs", "md5")
pub fn md5(f: File) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "path")
pub fn path(f: File) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "sha256")
pub fn sha256(f: File) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "tarCzvf")
pub fn tar_czvf(f: File, output_dir: String) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "unzip")
pub fn unzip(f: File, output_dir: String) -> Directory

@external(javascript, "../fluentci_ffi.mjs", "zip")
pub fn zip(f: File) -> Directory
