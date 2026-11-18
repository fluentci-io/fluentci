//// Account-authenticated cache token and upload membership procedures.

import fluentci_api/db/cache_members
import fluentci_api/db/cache_tokens
import fluentci_api/db/cache_usage
import fluentci_api/db/client.{type Db}
import fluentci_api/lexicon/models
import fluentci_api/node/runtime.{type Output, type Request, type Server}
import fluentci_api/schema/cache_members as member
import fluentci_api/schema/cache_tokens as token
import fluentci_api/schema/cache_usage as usage
import gleam/javascript/promise.{type Promise}

@external(javascript, "./cache_ffi.mjs", "resolveAccount")
fn resolve_account(server: Server, request: Request) -> Promise(Output)

@external(javascript, "./cache_ffi.mjs", "createToken")
fn create_token(
  server: Server,
  request: Request,
  allowed: fn(String, String) -> Promise(Bool),
  save: fn(String, String, String, String) -> Promise(Nil),
) -> Promise(Output)

@external(javascript, "./cache_tokens_ffi.mjs", "listTokens")
fn list_tokens(
  request: Request,
  list: fn(String, String) -> Promise(List(token.Row)),
) -> Promise(Output)

@external(javascript, "./cache_tokens_ffi.mjs", "revokeToken")
fn revoke_token(
  server: Server,
  request: Request,
  find: fn(String) -> Promise(List(token.Row)),
  revoke: fn(String, String) -> Promise(Nil),
) -> Promise(Output)

@external(javascript, "./cache_ffi.mjs", "membership")
fn membership(
  server: Server,
  request: Request,
  active: Bool,
  grant: fn(String, String, Bool) -> Promise(Nil),
) -> Promise(Output)

@external(javascript, "./cache_ffi.mjs", "manageCache")
fn manage_cache(
  server: Server,
  request: Request,
  action: String,
  record: fn(String, String, Int, Int, String) -> Promise(Nil),
) -> Promise(Output)

@external(javascript, "./cache_ffi.mjs", "listCollaborators")
fn list_collaborators(
  request: Request,
  list: fn(String, String) -> Promise(List(member.Row)),
) -> Promise(Output)

@external(javascript, "./cache_ffi.mjs", "usageHistory")
fn usage_history(
  request: Request,
  query: fn(String, String, String) -> Promise(List(usage.Row)),
) -> Promise(Output)

pub fn register(server: Server, db: Db) -> Nil {
  runtime.method(server, models.cache_resolve_account, fn(request) {
    resolve_account(server, request)
  })
  let record = fn(owner, date, bytes, keys, observed) {
    cache_usage.record(db, owner, date, bytes, keys, observed)
  }
  runtime.method(server, models.cache_get_usage_history, fn(request) {
    usage_history(request, fn(owner, after, before) {
      cache_usage.history(db, owner, after, before)
    })
  })
  runtime.method(server, models.cache_list_keys, fn(request) {
    manage_cache(server, request, "list", record)
  })
  runtime.method(server, models.cache_delete_key, fn(request) {
    manage_cache(server, request, "delete", record)
  })
  runtime.method(server, models.cache_clear_cache, fn(request) {
    manage_cache(server, request, "clear", record)
  })
  runtime.method(server, models.cache_list_collaborators, fn(request) {
    list_collaborators(request, fn(owner, cursor) {
      cache_members.list(db, owner, cursor)
    })
  })
  runtime.method(server, models.cache_create_token, fn(request) {
    create_token(
      server,
      request,
      fn(owner, actor) { cache_members.allowed(db, owner, actor) },
      fn(id, owner, actor, created) {
        cache_tokens.save(db, id, owner, actor, created)
      },
    )
  })
  runtime.method(server, models.cache_list_tokens, fn(request) {
    list_tokens(request, fn(owner, cursor) {
      cache_tokens.list(db, owner, cursor)
    })
  })
  runtime.method(server, models.cache_revoke_token, fn(request) {
    revoke_token(
      server,
      request,
      fn(id) { cache_tokens.find(db, id) },
      fn(owner, id) { cache_tokens.revoke(db, owner, id) },
    )
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
