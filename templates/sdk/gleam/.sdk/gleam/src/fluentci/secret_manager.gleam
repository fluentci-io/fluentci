import fluentci/secret.{type Secret}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type SecretManager

@external(javascript, "../fluentci_ffi.mjs", "getSecret")
pub fn get_secret(
  secret_manager: SecretManager,
  name: String,
) -> Promise(Array(Secret))

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(secret_manager: SecretManager) -> Promise(String)
