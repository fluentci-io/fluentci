import gleam/javascript/promise.{type Promise}

pub type Socket

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(socket: Socket) -> Promise(String)
