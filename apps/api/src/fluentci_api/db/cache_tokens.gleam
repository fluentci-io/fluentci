import fluentci_api/db/client.{type Db}
import fluentci_api/drizzle/orm.{
  all, and, asc, eq, from, gt, insert, limit, order_by, set, update, where,
}
import fluentci_api/schema/cache_tokens as c
import gleam/javascript/promise.{type Promise}
import gleam/option.{None}

pub fn save(
  db: Db,
  id: String,
  owner: String,
  actor: String,
  created: String,
) -> Promise(Nil) {
  let t = c.table()
  use _ <- promise.map(all(
    db,
    insert(t, [
      set(c.id(t), id),
      set(c.owner(t), owner),
      set(c.actor(t), actor),
      set(c.created_at(t), created),
      set(c.expires_at(t), None),
      set(c.active(t), True),
    ]),
  ))
  Nil
}

pub fn list(db: Db, owner: String, cursor: String) -> Promise(List(c.Row)) {
  let t = c.table()
  all(
    db,
    from(t)
      |> where(and([eq(c.owner(t), owner), gt(c.id(t), cursor)]))
      |> order_by([asc(c.id(t))])
      |> limit(21),
  )
}

pub fn find(db: Db, id: String) -> Promise(List(c.Row)) {
  let t = c.table()
  all(db, from(t) |> where(eq(c.id(t), id)) |> limit(1))
}

pub fn revoke(db: Db, owner: String, id: String) -> Promise(Nil) {
  let t = c.table()
  use _ <- promise.map(all(
    db,
    update(t, [set(c.active(t), False)])
      |> where(and([eq(c.owner(t), owner), eq(c.id(t), id)])),
  ))
  Nil
}
