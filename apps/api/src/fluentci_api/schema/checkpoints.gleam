//// SQLite table and typed row definition.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, integer, integer_column,
  table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(source: String, time_us: Int)
}

pub fn decoder() -> Decoder(Row) {
  use source <- decode.field("source", decode.string)
  use time_us <- decode.field("time_us", decode.int)
  decode.success(Row(source, time_us))
}

pub fn table() -> Table(Row) {
  db_table(
    "checkpoints",
    [
      text_column("source", False, True),
      integer_column("time_us", False, False),
    ],
    [],
    decoder(),
  )
}

pub fn source(table: Table(Row)) -> Expression(String) {
  column(table, "source", text())
}

pub fn time_us(table: Table(Row)) -> Expression(Int) {
  column(table, "time_us", integer())
}
