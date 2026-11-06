import fluentci_api/db/client.{type Db}
import fluentci_api/db/downloads
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Server}
import gleam/javascript/promise
import gleam/json

pub fn register(server: Server, database: Db) -> Nil {
  runtime.method(server, models.registry_record_download, fn(request) {
    let event = runtime.download_event(request)
    use author <- promise.await(runtime.resolve_actor(server, event.handle))
    use output <- promise.map(downloads.record(
      database,
      author,
      event.name,
      event.version,
      event.event_id,
      runtime.current_day(),
    ))
    output
    |> models.encode_registry_record_download_output
    |> json.to_string
    |> runtime.json
  })
}
