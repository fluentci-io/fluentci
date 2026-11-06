import fluentci_api/db/client.{type Db} as db
import fluentci_api/lexicon/models
import fluentci_api/model
import fluentci_api/node/runtime.{type Server}
import gleam/javascript/promise
import gleam/json

pub fn register(server: Server, database: Db) -> Nil {
  runtime.method(server, models.registry_search_packages, fn(request) {
    use author <- promise.await(
      runtime.resolve_author(runtime.param(request, "author")),
    )
    use page <- promise.map(db.search_packages(
      database,
      runtime.param(request, "q"),
      author,
      runtime.limit(request),
      runtime.param(request, "cursor"),
      runtime.param(request, "filter"),
    ))
    page |> model.encode_page |> json.to_string |> runtime.json
  })
}
