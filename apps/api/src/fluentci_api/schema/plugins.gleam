//// SQLite table and typed row definition.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, boolean, boolean_column, column, index, integer,
  integer_column, optional, table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}
import gleam/option.{type Option}

pub type Row {
  Row(
    uri: String,
    cid: Option(String),
    author: String,
    name: Option(String),
    description: Option(String),
    version: Option(String),
    published_at: Option(String),
    license: Option(String),
    url: Option(String),
    sha256: Option(String),
    size: Option(Int),
    deleted: Bool,
    event_time: Int,
  )
}

pub fn decoder() -> Decoder(Row) {
  use uri <- decode.field("uri", decode.string)
  use cid <- decode.field("cid", decode.optional(decode.string))
  use author <- decode.field("author", decode.string)
  use name <- decode.field("name", decode.optional(decode.string))
  use description <- decode.field("description", decode.optional(decode.string))
  use version <- decode.field("version", decode.optional(decode.string))
  use published_at <- decode.field(
    "published_at",
    decode.optional(decode.string),
  )
  use license <- decode.field("license", decode.optional(decode.string))
  use url <- decode.field("url", decode.optional(decode.string))
  use sha256 <- decode.field("sha256", decode.optional(decode.string))
  use size <- decode.field("size", decode.optional(decode.int))
  use deleted <- decode.field("deleted", decode.bool)
  use event_time <- decode.field("event_time", decode.int)
  decode.success(Row(
    uri,
    cid,
    author,
    name,
    description,
    version,
    published_at,
    license,
    url,
    sha256,
    size,
    deleted,
    event_time,
  ))
}

pub fn table() -> Table(Row) {
  db_table(
    "plugin_records",
    [
      text_column("uri", False, True),
      text_column("cid", True, False),
      text_column("author", False, False),
      text_column("name", True, False),
      text_column("description", True, False),
      text_column("version", True, False),
      text_column("published_at", True, False),
      text_column("license", True, False),
      text_column("url", True, False),
      text_column("sha256", True, False),
      integer_column("size", True, False),
      boolean_column("deleted"),
      integer_column("event_time", False, False),
    ],
    [
      index("plugin_name_author", ["name", "author"], False),
      index("plugin_page", ["published_at", "uri"], False),
      index("plugin_author_name_version", ["author", "name", "version"], True),
    ],
    decoder(),
  )
}

pub fn uri(table: Table(Row)) -> Expression(String) {
  column(table, "uri", text())
}

pub fn cid(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "cid", optional(text()))
}

pub fn author(table: Table(Row)) -> Expression(String) {
  column(table, "author", text())
}

pub fn name(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "name", optional(text()))
}

pub fn description(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "description", optional(text()))
}

pub fn version(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "version", optional(text()))
}

pub fn published_at(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "published_at", optional(text()))
}

pub fn license(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "license", optional(text()))
}

pub fn url(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "url", optional(text()))
}

pub fn sha256(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "sha256", optional(text()))
}

pub fn size(table: Table(Row)) -> Expression(Option(Int)) {
  column(table, "size", optional(integer()))
}

pub fn deleted(table: Table(Row)) -> Expression(Bool) {
  column(table, "deleted", boolean())
}

pub fn event_time(table: Table(Row)) -> Expression(Int) {
  column(table, "event_time", integer())
}
