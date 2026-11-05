import gleam/javascript/promise.{type Promise}

pub type Secret

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(secret: Secret) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "mount")
pub fn mount(secret: Secret) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "path")
pub fn name(secret: Secret) -> Promise(String)

@external(javascript, "../fluentci_ffi.mjs", "plaintext")
pub fn plaintext(secret: Secret) -> Promise(String)
