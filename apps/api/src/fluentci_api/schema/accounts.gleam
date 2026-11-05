//// SQLite table and typed row definition.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, boolean, boolean_column, column, integer,
  integer_column, table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(did: String, active: Bool, event_time: Int)
}

pub fn decoder() -> Decoder(Row) {
  use did <- decode.field("did", decode.string)
  use active <- decode.field("active", decode.bool)
  use event_time <- decode.field("event_time", decode.int)
  decode.success(Row(did, active, event_time))
}

pub fn table() -> Table(Row) {
  db_table(
    "accounts",
    [
      text_column("did", False, True),
      boolean_column("active"),
      integer_column("event_time", False, False),
    ],
    [],
    decoder(),
  )
}

pub fn did(table: Table(Row)) -> Expression(String) {
  column(table, "did", text())
}

pub fn active(table: Table(Row)) -> Expression(Bool) {
  column(table, "active", boolean())
}

pub fn event_time(table: Table(Row)) -> Expression(Int) {
  column(table, "event_time", integer())
}
