import gleam/javascript/promise.{type Promise}

pub type File

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(file: File) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "contents")
pub fn contents(file: File) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "digest")
pub fn digest(file: File) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "export_")
pub fn export(file: File, path: String) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(file: File) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "size")
pub fn size(file: File) -> Promise(Int)

@external(javascript, "../../dagger_ffi.mjs", "sync")
pub fn sync(file: File) -> Promise(File)

@external(javascript, "../../dagger_ffi.mjs", "withName")
pub fn with_name(file: File, name: String) -> File

@external(javascript, "../../dagger_ffi.mjs", "withTimestamps")
pub fn with_timestamps(file: File, timestamp: Int) -> File
