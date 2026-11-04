import fluentci/dagger/function_arg.{type JSON}
import gleam/javascript/promise.{type Promise}

pub type FunctionCallArgValue

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(f: FunctionCallArgValue) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(f: FunctionCallArgValue) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "value")
pub fn value(f: FunctionCallArgValue) -> Promise(JSON)
