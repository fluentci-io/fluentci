import fluentci/dagger/port.{type Port}
import fluentci/dagger/void.{type Void}
import gleam/javascript/array.{type Array}
import gleam/javascript/promise.{type Promise}

pub type Service

@external(javascript, "../../dagger_ffi.mjs", "id")
pub fn id(service: Service) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "endpoint")
pub fn endpoint(service: Service) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "hostname")
pub fn hostname(service: Service) -> Promise(String)

@external(javascript, "../../dagger_ffi.mjs", "ports")
pub fn ports(service: Service) -> Promise(Array(Port))

@external(javascript, "../../dagger_ffi.mjs", "start")
pub fn start(service: Service) -> Promise(Service)

@external(javascript, "../../dagger_ffi.mjs", "stop")
pub fn stop(service: Service) -> Promise(Service)

@external(javascript, "../../dagger_ffi.mjs", "up")
pub fn up(service: Service) -> Promise(Void)
