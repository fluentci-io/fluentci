import fluentci/dagger/enum_type_def.{type EnumTypeDef}
import gleam/javascript/promise.{type Promise}

pub type TypeDef

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(t: TypeDef) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "asEnum")
pub fn as_enum(t: TypeDef) -> EnumTypeDef
