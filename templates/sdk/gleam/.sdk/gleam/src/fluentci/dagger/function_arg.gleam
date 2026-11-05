import gleam/javascript/promise.{type Promise}

pub type JSON

pub type FunctionArg

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(f: FunctionArg) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "defaultValue")
pub fn default_value(f: FunctionArg) -> Promise(JSON)

@external(javascript, "../../dagger_ffi.mjs", "description")
pub fn description(f: FunctionArg) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(f: FunctionArg) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "typeDef")
pub fn type_def(f: FunctionArg) -> Promise(JSON)
