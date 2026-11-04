import fluentci/dagger/function_arg.{type JSON}
import fluentci/dagger/function_call_arg_value.{type FunctionCallArgValue}
import fluentci/dagger/void.{type Void}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type FunctionCall

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(f: FunctionCall) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "inputArgs")
pub fn input_args(f: FunctionCall) -> Promise(Array(FunctionCallArgValue))

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(f: FunctionCall) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "parent")
pub fn parent(f: FunctionCall) -> Promise(JSON)

@external(javascript, "../../dagger_ffi.mjs", "parentName")
pub fn parent_name(f: FunctionCall) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "returnValue")
pub fn return_value(f: FunctionCall, value: JSON) -> Promise(Void)
