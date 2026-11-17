//// Account-authenticated cache token and upload membership procedures.

import fluentci_api/db/cache_members
import fluentci_api/db/client.{type Db}
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Output, type Request, type Server}
import gleam/javascript/promise.{type Promise}

@external(javascript, "./cache_ffi.mjs", "createToken")
fn create_token(
  server: Server,
  request: Request,
  allowed: fn(String, String) -> Promise(Bool),
) -> Promise(Output)

@external(javascript, "./cache_ffi.mjs", "membership")
fn membership(
  server: Server,
  request: Request,
  active: Bool,
  grant: fn(String, String, Bool) -> Promise(Nil),
) -> Promise(Output)

pub fn register(server: Server, db: Db) -> Nil {
  runtime.method(server, models.cache_create_token, fn(request) {
    create_token(server, request, fn(owner, actor) {
      cache_members.allowed(db, owner, actor)
    })
  })
  runtime.method(server, models.cache_invite_user, fn(request) {
    membership(server, request, True, fn(owner, actor, active) {
      cache_members.grant(db, owner, actor, active)
    })
  })
  runtime.method(server, models.cache_revoke_user, fn(request) {
    membership(server, request, False, fn(owner, actor, active) {
      cache_members.grant(db, owner, actor, active)
    })
  })
}
