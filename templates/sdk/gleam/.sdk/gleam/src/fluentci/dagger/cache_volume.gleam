import gleam/javascript/promise.{type Promise}

pub type CacheVolume

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(cache_volume: CacheVolume) -> Promise(String)
