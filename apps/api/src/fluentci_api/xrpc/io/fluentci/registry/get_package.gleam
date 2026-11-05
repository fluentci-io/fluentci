import fluentci_api/db/client.{type Db} as db
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Server}
import gleam/javascript/promise
import gleam/json

pub fn register(server: Server, database: Db) -> Nil {
  runtime.method(server, models.registry_get_package, fn(request) {
    use author <- promise.await(
      runtime.resolve_author(runtime.param(request, "author")),
    )
    use package <- promise.map(db.get_package(
      database,
      runtime.param(request, "name"),
      runtime.param(request, "version"),
      author,
    ))
    models.RegistryGetPackageOutput(package)
    |> models.encode_registry_get_package_output
    |> json.to_string
    |> runtime.json
  })
}
