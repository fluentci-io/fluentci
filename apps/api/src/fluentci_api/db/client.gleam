//// Typed bindings to SQLite queries built and executed by Drizzle ORM.

import fluentci_api/model.{type Event, type Package, type Page}
import gleam/javascript/promise.{type Promise}

pub type Db

@external(javascript, "./client_ffi.mjs", "open")
pub fn open() -> Promise(Db)

@external(javascript, "./client_ffi.mjs", "close")
pub fn close(db: Db) -> Promise(Nil)

@external(javascript, "./client_ffi.mjs", "listPackages")
pub fn list_packages(
  db: Db,
  query: String,
  author: String,
  limit: Int,
  cursor: String,
) -> Promise(Page)

@external(javascript, "./client_ffi.mjs", "getPackage")
pub fn get_package(
  db: Db,
  name: String,
  version: String,
  author: String,
) -> Promise(Package)

@external(javascript, "./client_ffi.mjs", "applyEvent")
pub fn apply_event(db: Db, event: Event) -> Promise(Nil)

@external(javascript, "./client_ffi.mjs", "cursor")
pub fn cursor(db: Db) -> Promise(Int)
