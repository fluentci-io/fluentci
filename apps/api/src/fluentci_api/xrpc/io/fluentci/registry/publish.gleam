import fluentci_api/db/client.{type Db}
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Server}

pub fn register(server: Server, _database: Db) -> Nil {
  runtime.method(server, models.registry_publish, fn(request) {
    runtime.upload(server, request)
  })
}
