import gleam/javascript/promise.{type Promise}

pub type Cache

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(cache: Cache) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "key")
pub fn key(cache: Cache) -> Promise(String)
