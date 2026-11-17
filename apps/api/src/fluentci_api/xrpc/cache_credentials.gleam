import fluentci_api/db/cache_credentials as db
import fluentci_api/db/cache_tokens
import fluentci_api/db/client.{type Db}
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Output, type Request, type Server}
import fluentci_api/schema/cache_credentials as c
import gleam/javascript/promise.{type Promise}

@external(javascript, "./cache_credentials_ffi.mjs", "createCredential")
fn create(
  server: Server,
  request: Request,
  save: fn(String, String, String, String, String, String) -> Promise(Nil),
) -> Promise(Output)

@external(javascript, "./cache_credentials_ffi.mjs", "listCredentials")
fn list(
  request: Request,
  select: fn(String) -> Promise(List(c.Row)),
) -> Promise(Output)

@external(javascript, "./cache_credentials_ffi.mjs", "revokeCredential")
fn revoke(
  request: Request,
  disable: fn(String, String) -> Promise(Nil),
) -> Promise(Output)

@external(javascript, "./cache_credentials_ffi.mjs", "exchangeCredential")
fn exchange(
  server: Server,
  request: Request,
  find: fn(String) -> Promise(List(c.Row)),
  save: fn(String, String, String, String, String) -> Promise(Nil),
) -> Promise(Output)

pub fn register(server: Server, connection: Db) -> Nil {
  runtime.method(server, models.cache_create_credential, fn(request) {
    create(server, request, fn(id, owner, label, digest, created, expires) {
      db.save(connection, id, owner, label, digest, created, expires)
    })
  })
  runtime.method(server, models.cache_list_credentials, fn(request) {
    list(request, fn(owner) { db.list(connection, owner) })
  })
  runtime.method(server, models.cache_revoke_credential, fn(request) {
    revoke(request, fn(owner, id) { db.revoke(connection, owner, id) })
  })
  runtime.method(server, models.cache_exchange_credential, fn(request) {
    exchange(
      server,
      request,
      fn(id) { db.find(connection, id) },
      fn(id, owner, actor, created, expires) {
        cache_tokens.save(connection, id, owner, actor, created, expires)
      },
    )
  })
}
