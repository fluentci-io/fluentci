//// UTC daily counters maintained by download tracking, never publisher metadata.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, column_default, index, integer,
  integer_column, table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(uri: String, date: String, downloads: Int)
}

pub fn decoder() -> Decoder(Row) {
  use uri <- decode.field("uri", decode.string)
  use date <- decode.field("date", decode.string)
  use downloads <- decode.field("downloads", decode.int)
  decode.success(Row(uri, date, downloads))
}

pub fn table() -> Table(Row) {
  db_table(
    "plugin_download_days",
    [
      text_column("uri", False, False),
      text_column("date", False, False),
      integer_column("downloads", False, False) |> column_default(0),
    ],
    [index("plugin_download_days_uri_date", ["uri", "date"], True)],
    decoder(),
  )
}

pub fn uri(table: Table(Row)) -> Expression(String) {
  column(table, "uri", text())
}

pub fn date(table: Table(Row)) -> Expression(String) {
  column(table, "date", text())
}

pub fn downloads(table: Table(Row)) -> Expression(Int) {
  column(table, "downloads", integer())
}
