//// SQLite lifecycle. All application queries are constructed in Gleam.

import gleam/javascript/promise.{type Promise}

pub type Db

@external(javascript, "./client_ffi.mjs", "open")
pub fn open() -> Promise(Db)

@external(javascript, "./client_ffi.mjs", "close")
pub fn close(db: Db) -> Promise(Nil)

@external(javascript, "./client_ffi.mjs", "sourceOf")
pub fn source(db: Db) -> String
