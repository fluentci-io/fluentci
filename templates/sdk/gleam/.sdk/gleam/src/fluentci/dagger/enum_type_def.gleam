import fluentci/dagger/enum_value_type_def.{type EnumValueTypeDef}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type EnumTypeDef

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(f: EnumTypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "description")
pub fn description(f: EnumTypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "name")
pub fn name(f: EnumTypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "sourceModuleName")
pub fn source_module_name(f: EnumTypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "values")
pub fn values(f: EnumTypeDef) -> Promise(Array(EnumValueTypeDef))
