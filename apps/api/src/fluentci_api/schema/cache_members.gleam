//// Cache upload grants. Owners are implicit members; reads are public.

import fluentci_api/drizzle/orm.{
  type Expression, type Table, boolean, boolean_column, column, index,
  table as db_table, text, text_column,
}
import gleam/dynamic/decode.{type Decoder}

pub type Row {
  Row(owner: String, actor: String, active: Bool)
}

pub fn decoder() -> Decoder(Row) {
  use owner <- decode.field("owner", decode.string)
  use actor <- decode.field("actor", decode.string)
  use active <- decode.field("active", decode.bool)
  decode.success(Row(owner, actor, active))
}

pub fn table() -> Table(Row) {
  db_table(
    "cache_members",
    [
      text_column("owner", False, False),
      text_column("actor", False, False),
      boolean_column("active"),
    ],
    [index("cache_members_owner_actor", ["owner", "actor"], True)],
    decoder(),
  )
}

pub fn owner(t: Table(Row)) -> Expression(String) {
  column(t, "owner", text())
}

pub fn actor(t: Table(Row)) -> Expression(String) {
  column(t, "actor", text())
}

pub fn active(t: Table(Row)) -> Expression(Bool) {
  column(t, "active", boolean())
}
