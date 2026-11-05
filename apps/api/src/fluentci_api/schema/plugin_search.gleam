//// SQLite table and typed row definition.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, optional, table as db_table, text,
  text_column,
}
import gleam/dynamic/decode.{type Decoder}
import gleam/option.{type Option}

pub type Row {
  Row(uri: String, name: Option(String), description: Option(String))
}

pub fn decoder() -> Decoder(Row) {
  use uri <- decode.field("uri", decode.string)
  use name <- decode.field("name", decode.optional(decode.string))
  use description <- decode.field("description", decode.optional(decode.string))
  decode.success(Row(uri, name, description))
}

pub fn table() -> Table(Row) {
  db_table(
    "plugin_search",
    [
      text_column("uri", False, False),
      text_column("name", True, False),
      text_column("description", True, False),
    ],
    [],
    decoder(),
  )
}

pub fn uri(table: Table(Row)) -> Expression(String) {
  column(table, "uri", text())
}

pub fn name(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "name", optional(text()))
}

pub fn description(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "description", optional(text()))
}
