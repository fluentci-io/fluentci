import fluentci_api/db/client.{type Db}
import fluentci_api/drizzle/orm.{
  all, and, asc, eq, from, gt, insert, limit, lt, on_conflict_do_nothing,
  on_conflict_do_update_columns, order_by, set, transaction, where,
}
import fluentci_api/schema/cache_usage as u
import fluentci_api/schema/cache_usage_owners as o
import gleam/javascript/promise.{type Promise}

pub fn record(
  db: Db,
  owner: String,
  date: String,
  bytes: Int,
  keys: Int,
  observed: String,
) -> Promise(Nil) {
  use tx <- transaction(db)
  let owners = o.table()
  use _ <- promise.await(all(
    tx,
    insert(owners, [set(o.owner(owners), owner)]) |> on_conflict_do_nothing,
  ))
  let t = u.table()
  use _ <- promise.map(all(
    tx,
    insert(t, [
      set(u.owner(t), owner),
      set(u.date(t), date),
      set(u.bytes(t), bytes),
      set(u.key_count(t), keys),
      set(u.observed_at(t), observed),
    ])
      |> on_conflict_do_update_columns(
        [u.owner(t), u.date(t)],
        [
          set(u.bytes(t), bytes),
          set(u.key_count(t), keys),
          set(u.observed_at(t), observed),
        ],
        and([]),
      ),
  ))
  Nil
}

pub fn history(
  db: Db,
  owner: String,
  after: String,
  before: String,
) -> Promise(List(u.Row)) {
  let t = u.table()
  all(
    db,
    from(t)
      |> where(
        and([eq(u.owner(t), owner), gt(u.date(t), after), lt(u.date(t), before)]),
      )
      |> order_by([asc(u.date(t))])
      |> limit(30),
  )
}

pub fn owners(db: Db, cursor: String) -> Promise(List(o.Row)) {
  let t = o.table()
  all(
    db,
    from(t)
      |> where(gt(o.owner(t), cursor))
      |> order_by([asc(o.owner(t))])
      |> limit(100),
  )
}
