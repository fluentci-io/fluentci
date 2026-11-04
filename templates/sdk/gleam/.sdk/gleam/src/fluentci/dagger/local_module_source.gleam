import gleam/javascript/promise.{type Promise}

pub type LocalModuleSource

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(module_source: LocalModuleSource) -> Promise(String)
