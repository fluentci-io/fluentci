//// Registers all FluentCI XRPC methods.

import fluentci_api/db/client.{type Db}
import fluentci_api/node/runtime.{type Server}
import fluentci_api/xrpc/io/fluentci/registry/get_actor_packages
import fluentci_api/xrpc/io/fluentci/registry/get_package
import fluentci_api/xrpc/io/fluentci/registry/list_packages
import fluentci_api/xrpc/io/fluentci/registry/publish
import fluentci_api/xrpc/io/fluentci/registry/search_packages

pub fn register(server: Server, database: Db) -> Nil {
  list_packages.register(server, database)
  get_actor_packages.register(server, database)
  search_packages.register(server, database)
  get_package.register(server, database)
  publish.register(server, database)
}
