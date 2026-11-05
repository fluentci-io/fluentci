import fluentci_api/db
import fluentci_api/env
import fluentci_api/jetstream
import fluentci_api/registry
import fluentci_api/runtime
import gleam/javascript/promise

pub fn main() -> Nil {
  case env.load(env.Server) {
    Error(errors) -> env.abort(errors)
    Ok(config) -> {
      env.apply(config)
      let _ =
        promise.tap(db.open(), fn(database) {
          let server = runtime.create(database)
          registry.register(server, database)
          let stop_indexer =
            jetstream.start(database, jetstream.ingest(database, _))
          runtime.listen(server, database, stop_indexer)
        })
      Nil
    }
  }
}
