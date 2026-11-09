import fluentci_api/db/client.{type Db} as db
import fluentci_api/lexicon/models
import fluentci_api/model
import fluentci_api/node/runtime.{type Server}
import gleam/javascript/promise
import gleam/json

pub fn register(server: Server, database: Db) -> Nil {
  runtime.method(server, models.registry_list_packages, fn(request) {
    use author <- promise.await(
      runtime.resolve_author(runtime.param(request, "author")),
    )
    use page <- promise.map(db.list_packages_sorted(
      database,
      "",
      author,
      runtime.limit(request),
      runtime.param(request, "cursor"),
      runtime.param(request, "sort"),
      runtime.flag(request, "latest"),
    ))
    page |> model.encode_page |> json.to_string |> runtime.json
  })
}
