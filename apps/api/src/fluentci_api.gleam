import fluentci_api/db/client as db
import fluentci_api/env
import fluentci_api/jetstream/client as jetstream
import fluentci_api/node/runtime
import fluentci_api/xrpc/routes
import gleam/javascript/promise

pub fn main() -> Nil {
  case env.load(env.Server) {
    Error(errors) -> env.abort(errors)
    Ok(config) -> {
      env.apply(config)
      let _ =
        promise.tap(db.open(), fn(database) {
          let server = runtime.create(database)
          routes.register(server, database)
          let stop_indexer =
            jetstream.start(database, jetstream.ingest(database, _))
          runtime.listen(server, database, stop_indexer)
        })
      Nil
    }
  }
}
