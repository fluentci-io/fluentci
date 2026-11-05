//// Jetstream records and checkpoints are committed atomically through Drizzle.

import fluentci_api/db/client.{type Db} as db
import fluentci_api/env
import fluentci_api/model.{type Event}
import gleam/javascript/promise.{type Promise}

@external(javascript, "./client_ffi.mjs", "decodeEvent")
pub fn decode_event(message: String) -> Result(Event, String)

@external(javascript, "./client_ffi.mjs", "start")
pub fn start(db: Db, ingest: fn(Db, String) -> Promise(Nil)) -> fn() -> Nil

@external(javascript, "./client_ffi.mjs", "standalone")
fn standalone(db: Db, stop: fn() -> Nil) -> Nil

pub fn ingest(database: Db, message: String) -> Promise(Nil) {
  case decode_event(message) {
    Ok(event) -> db.apply_event(database, event)
    Error(_) -> promise.resolve(Nil)
  }
}

pub fn main() -> Nil {
  case env.load(env.Indexer) {
    Error(errors) -> env.abort(errors)
    Ok(config) -> {
      env.apply(config)
      let _ =
        promise.tap(db.open(), fn(database) {
          let stop = start(database, ingest)
          standalone(database, stop)
        })
      Nil
    }
  }
}
