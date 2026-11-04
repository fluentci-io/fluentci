import gleam/javascript/promise.{type Promise}

pub type EnvVariable

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(env_variable: EnvVariable) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(env_variable: EnvVariable) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "value")
pub fn value(env_variable: EnvVariable) -> Promise(String)
