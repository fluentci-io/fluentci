//// Node HTTP / XRPC bindings. Application handlers are registered from Gleam.

import fluentci_api/db/client.{type Db}
import fluentci_api/lexicon/models.{type RegistryRecordDownloadInput}
import gleam/javascript/promise.{type Promise}

pub type Server

pub type Request

pub type Output

@external(javascript, "./runtime_ffi.mjs", "create")
pub fn create(db: Db) -> Server

@external(javascript, "./runtime_ffi.mjs", "method")
pub fn method(
  server: Server,
  nsid: String,
  handler: fn(Request) -> Promise(Output),
) -> Nil

@external(javascript, "./runtime_ffi.mjs", "param")
pub fn param(request: Request, key: String) -> String

@external(javascript, "./runtime_ffi.mjs", "limit")
pub fn limit(request: Request) -> Int

@external(javascript, "./runtime_ffi.mjs", "json")
pub fn json(body: String) -> Output

@external(javascript, "./runtime_ffi.mjs", "upload")
pub fn upload(server: Server, request: Request) -> Promise(Output)

@external(javascript, "./runtime_ffi.mjs", "listen")
pub fn listen(server: Server, db: Db, stop_indexer: fn() -> Nil) -> Nil

@external(javascript, "./runtime_ffi.mjs", "resolveAuthor")
pub fn resolve_author(author: String) -> Promise(String)

@external(javascript, "./runtime_ffi.mjs", "resolveActor")
pub fn resolve_actor(server: Server, actor: String) -> Promise(String)

@external(javascript, "./runtime_ffi.mjs", "downloadEvent")
pub fn download_event(request: Request) -> RegistryRecordDownloadInput

@external(javascript, "./runtime_ffi.mjs", "currentDay")
pub fn current_day() -> String

@external(javascript, "./runtime_ffi.mjs", "flag")
pub fn flag(request: Request, key: String) -> Bool
