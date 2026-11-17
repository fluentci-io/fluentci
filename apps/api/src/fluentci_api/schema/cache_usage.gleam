import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, integer, integer_column,
  table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(
    owner: String,
    date: String,
    bytes: Int,
    key_count: Int,
    observed_at: String,
  )
}

pub fn decoder() -> Decoder(Row) {
  use owner <- decode.field("owner", decode.string)
  use date <- decode.field("date", decode.string)
  use bytes <- decode.field("bytes", decode.int)
  use key_count <- decode.field("key_count", decode.int)
  use observed_at <- decode.field("observed_at", decode.string)
  decode.success(Row(owner, date, bytes, key_count, observed_at))
}

pub fn table() -> Table(Row) {
  db_table(
    "cache_usage",
    [
      text_column("owner", False, False),
      text_column("date", False, False),
      integer_column("bytes", False, False),
      integer_column("key_count", False, False),
      text_column("observed_at", False, False),
    ],
    [],
    decoder(),
  )
}

pub fn owner(t: Table(Row)) -> Expression(String) {
  column(t, "owner", text())
}

pub fn date(t: Table(Row)) -> Expression(String) {
  column(t, "date", text())
}

pub fn bytes(t: Table(Row)) -> Expression(Int) {
  column(t, "bytes", integer())
}

pub fn key_count(t: Table(Row)) -> Expression(Int) {
  column(t, "key_count", integer())
}

pub fn observed_at(t: Table(Row)) -> Expression(String) {
  column(t, "observed_at", text())
}
