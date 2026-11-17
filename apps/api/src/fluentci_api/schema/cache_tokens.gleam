import fluentci_api/drizzle/orm.{
  type Expression, type Table, boolean, boolean_column, column, index,
  table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(
    id: String,
    owner: String,
    actor: String,
    created_at: String,
    expires_at: String,
    active: Bool,
  )
}

pub fn decoder() -> Decoder(Row) {
  use id <- decode.field("id", decode.string)
  use owner <- decode.field("owner", decode.string)
  use actor <- decode.field("actor", decode.string)
  use created_at <- decode.field("created_at", decode.string)
  use expires_at <- decode.field("expires_at", decode.string)
  use active <- decode.field("active", decode.bool)
  decode.success(Row(id, owner, actor, created_at, expires_at, active))
}

pub fn table() -> Table(Row) {
  db_table(
    "cache_tokens",
    [
      text_column("id", False, True),
      text_column("owner", False, False),
      text_column("actor", False, False),
      text_column("created_at", False, False),
      text_column("expires_at", False, False),
      boolean_column("active"),
    ],
    [index("cache_tokens_owner", ["owner", "id"], False)],
    decoder(),
  )
}

pub fn id(t: Table(Row)) -> Expression(String) {
  column(t, "id", text())
}

pub fn owner(t: Table(Row)) -> Expression(String) {
  column(t, "owner", text())
}

pub fn actor(t: Table(Row)) -> Expression(String) {
  column(t, "actor", text())
}

pub fn created_at(t: Table(Row)) -> Expression(String) {
  column(t, "created_at", text())
}

pub fn expires_at(t: Table(Row)) -> Expression(String) {
  column(t, "expires_at", text())
}

pub fn active(t: Table(Row)) -> Expression(Bool) {
  column(t, "active", boolean())
}
