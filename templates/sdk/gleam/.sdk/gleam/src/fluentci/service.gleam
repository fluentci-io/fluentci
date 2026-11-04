import gleam/javascript/promise.{type Promise}

pub type Service

@external(javascript, "../fluentci_ffi.mjs", "id")
pub fn id(service: Service) -> Promise(String)
