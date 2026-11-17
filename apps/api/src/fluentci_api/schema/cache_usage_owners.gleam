import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(owner: String)
}

pub fn decoder() -> Decoder(Row) {
  use owner <- decode.field("owner", decode.string)
  decode.success(Row(owner))
}

pub fn table() -> Table(Row) {
  db_table(
    "cache_usage_owners",
    [text_column("owner", False, True)],
    [],
    decoder(),
  )
}

pub fn owner(t: Table(Row)) -> Expression(String) {
  column(t, "owner", text())
}
