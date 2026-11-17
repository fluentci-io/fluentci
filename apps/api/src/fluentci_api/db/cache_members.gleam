import fluentci_api/db/client.{type Db}
import fluentci_api/drizzle/orm.{
  all, and, asc, eq, from, gt, insert, limit, on_conflict_do_nothing, order_by,
  set, transaction, update, where,
}
import fluentci_api/schema/cache_members as m
import gleam/javascript/promise.{type Promise}

pub fn allowed(db: Db, owner: String, actor: String) -> Promise(Bool) {
  case owner == actor {
    True -> promise.resolve(True)
    False -> {
      let t = m.table()
      use rows <- promise.map(all(
        db,
        from(t)
          |> where(
            and([
              eq(m.owner(t), owner),
              eq(m.actor(t), actor),
              eq(m.active(t), True),
            ]),
          )
          |> limit(1),
      ))
      case rows {
        [] -> False
        _ -> True
      }
    }
  }
}

pub fn grant(
  db: Db,
  owner: String,
  actor: String,
  active: Bool,
) -> Promise(Nil) {
  use tx <- transaction(db)
  let t = m.table()
  use _ <- promise.await(all(
    tx,
    insert(t, [
      set(m.owner(t), owner),
      set(m.actor(t), actor),
      set(m.active(t), active),
    ])
      |> on_conflict_do_nothing,
  ))
  use _ <- promise.map(all(
    tx,
    update(t, [set(m.active(t), active)])
      |> where(and([eq(m.owner(t), owner), eq(m.actor(t), actor)])),
  ))
  Nil
}

pub fn list(db: Db, owner: String, cursor: String) -> Promise(List(m.Row)) {
  let t = m.table()
  all(
    db,
    from(t)
      |> where(
        and([
          eq(m.owner(t), owner),
          eq(m.active(t), True),
          gt(m.actor(t), cursor),
        ]),
      )
      |> order_by([asc(m.actor(t))])
      |> limit(101),
  )
}
