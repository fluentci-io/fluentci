//// SQLite table and typed row definition.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(id: String)
}

pub fn decoder() -> Decoder(Row) {
  use id <- decode.field("id", decode.string)
  decode.success(Row(id))
}

pub fn table() -> Table(Row) {
  db_table(
    "jetstream_events",
    [
      text_column("id", False, True),
    ],
    [],
    decoder(),
  )
}

pub fn id(table: Table(Row)) -> Expression(String) {
  column(table, "id", text())
}
