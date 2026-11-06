import fluentci_api/db/client.{type Db} as db
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Server}
import gleam/javascript/promise
import gleam/json

pub fn register(server: Server, database: Db) -> Nil {
  runtime.method(server, models.registry_get_actor_packages, fn(request) {
    use actor <- promise.await(runtime.resolve_actor(
      server,
      runtime.param(request, "actor"),
    ))
    use page <- promise.map(db.actor_packages(
      database,
      actor,
      runtime.limit(request),
      runtime.param(request, "cursor"),
    ))
    models.RegistryGetActorPackagesOutput(page.packages, page.cursor)
    |> models.encode_registry_get_actor_packages_output
    |> json.to_string
    |> runtime.json
  })
}
