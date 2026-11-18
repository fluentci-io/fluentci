//// SQLite table and typed row definition.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, integer, integer_column,
  table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(id: String, did: String, collection: String, event_time: Int)
}

pub fn decoder() -> Decoder(Row) {
  use id <- decode.field("id", decode.string)
  use did <- decode.field("did", decode.string)
  use collection <- decode.field("collection", decode.string)
  use event_time <- decode.field("event_time", decode.int)
  decode.success(Row(id, did, collection, event_time))
}

pub fn table() -> Table(Row) {
  db_table(
    "jetstream_events",
    [
      text_column("id", False, True),
      text_column("did", False, False),
      text_column("collection", False, False),
      integer_column("event_time", False, False),
    ],
    [],
    decoder(),
  )
}

pub fn id(table: Table(Row)) -> Expression(String) {
  column(table, "id", text())
}

pub fn did(table: Table(Row)) -> Expression(String) {
  column(table, "did", text())
}

pub fn collection(table: Table(Row)) -> Expression(String) {
  column(table, "collection", text())
}

pub fn event_time(table: Table(Row)) -> Expression(Int) {
  column(table, "event_time", integer())
}
