import fluentci_api/db.{type Db}
import fluentci_api/model
import fluentci_api/runtime.{type Server}
import gleam/javascript/promise
import gleam/json

pub fn register(server: Server, database: Db) -> Nil {
  runtime.method(server, "io.fluentci.registry.listPackages", fn(request) {
    use author <- promise.await(
      runtime.resolve_author(runtime.param(request, "author")),
    )
    use page <- promise.map(db.list_packages(
      database,
      "",
      author,
      runtime.limit(request),
      runtime.param(request, "cursor"),
    ))
    page |> model.encode_page |> json.to_string |> runtime.json
  })
  runtime.method(server, "io.fluentci.registry.searchPackages", fn(request) {
    use author <- promise.await(
      runtime.resolve_author(runtime.param(request, "author")),
    )
    use page <- promise.map(db.list_packages(
      database,
      runtime.param(request, "q"),
      author,
      runtime.limit(request),
      runtime.param(request, "cursor"),
    ))
    page |> model.encode_page |> json.to_string |> runtime.json
  })
  runtime.method(server, "io.fluentci.registry.getPackage", fn(request) {
    use author <- promise.await(
      runtime.resolve_author(runtime.param(request, "author")),
    )
    use package <- promise.map(db.get_package(
      database,
      runtime.param(request, "name"),
      runtime.param(request, "version"),
      author,
    ))
    json.object([#("package", model.encode_package(package))])
    |> json.to_string
    |> runtime.json
  })
  runtime.method(server, "io.fluentci.registry.publish", fn(request) {
    runtime.upload(server, request)
  })
}
