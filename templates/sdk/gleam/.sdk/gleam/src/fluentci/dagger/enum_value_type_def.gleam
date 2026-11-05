import gleam/javascript/promise.{type Promise}

pub type EnumValueTypeDef

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(f: EnumValueTypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "description")
pub fn description(f: EnumValueTypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(f: EnumValueTypeDef) -> Promise(String)
