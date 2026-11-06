//// Idempotency ledger for authenticated proxy download events.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, column, index, table as db_table, text,
  text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(event_id: String, uri: String, date: String)
}

fn decoder() -> Decoder(Row) {
  use event_id <- decode.field("event_id", decode.string)
  use uri <- decode.field("uri", decode.string)
  use date <- decode.field("date", decode.string)
  decode.success(Row(event_id, uri, date))
}

pub fn table() -> Table(Row) {
  db_table(
    "plugin_download_events",
    [
      text_column("event_id", False, True),
      text_column("uri", False, False),
      text_column("date", False, False),
    ],
    [index("plugin_download_events_date", ["date"], False)],
    decoder(),
  )
}

pub fn event_id(table: Table(Row)) -> Expression(String) {
  column(table, "event_id", text())
}

pub fn uri(table: Table(Row)) -> Expression(String) {
  column(table, "uri", text())
}

pub fn date(table: Table(Row)) -> Expression(String) {
  column(table, "date", text())
}
