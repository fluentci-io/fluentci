import gleam/javascript/promise.{type Promise}

pub type Secret

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(secret: Secret) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(secret: Secret) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "plaintext")
pub fn plaintext(secret: Secret) -> Promise(String)
