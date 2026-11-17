import fluentci_api/db/client.{type Db}
import fluentci_api/drizzle/orm.{
  all, and, desc, eq, from, insert, limit, order_by, set, update, where,
}
import fluentci_api/schema/cache_credentials as c
import gleam/javascript/promise.{type Promise}

pub fn save(
  db: Db,
  id: String,
  owner: String,
  label: String,
  digest: String,
  created: String,
  expires: String,
) -> Promise(Nil) {
  let t = c.table()
  use _ <- promise.map(all(
    db,
    insert(t, [
      set(c.id(t), id),
      set(c.owner(t), owner),
      set(c.label(t), label),
      set(c.digest(t), digest),
      set(c.created_at(t), created),
      set(c.expires_at(t), expires),
      set(c.active(t), True),
    ]),
  ))
  Nil
}

pub fn list(db: Db, owner: String) -> Promise(List(c.Row)) {
  let t = c.table()
  all(
    db,
    from(t)
      |> where(eq(c.owner(t), owner))
      |> order_by([desc(c.created_at(t))])
      |> limit(100),
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
