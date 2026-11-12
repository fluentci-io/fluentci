//// Timestamp-ordered PDS likes and unlike tombstones, one deterministic record per actor/module.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, boolean, boolean_column, column, index, integer,
  integer_column, optional, table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}
import gleam/option.{type Option}

pub type Row {
  Row(
    uri: String,
    actor: String,
    subject_author: String,
    name: Option(String),
    active: Bool,
    event_time: Int,
  )
}

pub fn decoder() -> Decoder(Row) {
  use uri <- decode.field("uri", decode.string)
  use actor <- decode.field("actor", decode.string)
  use subject_author <- decode.field("subject_author", decode.string)
  use name <- decode.field("name", decode.optional(decode.string))
  use active <- decode.field("active", decode.bool)
  use event_time <- decode.field("event_time", decode.int)
  decode.success(Row(uri, actor, subject_author, name, active, event_time))
}

pub fn table() -> Table(Row) {
  db_table(
    "module_likes",
    [
      text_column("uri", False, True),
      text_column("actor", False, False),
      text_column("subject_author", False, False),
      text_column("name", True, False),
      boolean_column("active"),
      integer_column("event_time", False, False),
    ],
    [
      index(
        "module_likes_subject",
        ["subject_author", "name", "active", "actor"],
        False,
      ),
      index("module_likes_actor", ["actor", "active"], False),
    ],
    decoder(),
  )
}

pub fn uri(table: Table(Row)) -> Expression(String) {
  column(table, "uri", text())
}

pub fn actor(table: Table(Row)) -> Expression(String) {
  column(table, "actor", text())
}

pub fn subject_author(table: Table(Row)) -> Expression(String) {
  column(table, "subject_author", text())
}

pub fn name(table: Table(Row)) -> Expression(Option(String)) {
  column(table, "name", optional(text()))
}

pub fn active(table: Table(Row)) -> Expression(Bool) {
  column(table, "active", boolean())
}

pub fn event_time(table: Table(Row)) -> Expression(Int) {
  column(table, "event_time", integer())
}
