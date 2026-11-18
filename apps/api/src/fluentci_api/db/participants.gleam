//// Keep account status only for identities with recorded FluentCI activity.

import fluentci_api/db/connection.{type Db}
import fluentci_api/drizzle/orm.{
  type Condition, type Expression, and, count_rows, delete_count, eq, eq_columns,
  evaluate, exists, from, not, or, text, transaction, value, where,
}
import fluentci_api/lexicon/models
import fluentci_api/schema/accounts
import fluentci_api/schema/cache_credentials as credentials
import fluentci_api/schema/cache_members as members
import fluentci_api/schema/cache_tokens as tokens
import fluentci_api/schema/cache_usage as usage
import fluentci_api/schema/cache_usage_owners as owners
import fluentci_api/schema/events
import fluentci_api/schema/likes
import fluentci_api/schema/plugins
import gleam/javascript/promise.{type Promise}

// Revoked memberships/tokens and inactive likes still prove historical activity.
pub fn related(actor: Expression(String)) -> Condition {
  let p = plugins.table()
  let l = likes.table()
  let t = tokens.table()
  let m = members.table()
  let c = credentials.table()
  let u = usage.table()
  let o = owners.table()
  let e = events.table()
  or([
    exists(from(p) |> where(eq_columns(plugins.author(p), actor))),
    exists(
      from(l)
      |> where(
        or([
          eq_columns(likes.actor(l), actor),
          eq_columns(likes.subject_author(l), actor),
        ]),
      ),
    ),
    exists(
      from(t)
      |> where(
        or([
          eq_columns(tokens.owner(t), actor),
          eq_columns(tokens.actor(t), actor),
        ]),
      ),
    ),
    exists(
      from(m)
      |> where(
        or([
          eq_columns(members.owner(m), actor),
          eq_columns(members.actor(m), actor),
        ]),
      ),
    ),
    exists(from(c) |> where(eq_columns(credentials.owner(c), actor))),
    exists(from(u) |> where(eq_columns(usage.owner(u), actor))),
    exists(from(o) |> where(eq_columns(owners.owner(o), actor))),
    exists(
      from(e)
      |> where(
        and([
          eq_columns(events.did(e), actor),
          or([
            eq(events.collection(e), models.plugin),
            eq(events.collection(e), models.like),
          ]),
        ]),
      ),
    ),
  ])
}

pub fn tracked(db: Db, actor: String) -> Promise(Bool) {
  evaluate(db, related(value(actor, text())))
}

pub fn inventory(db: Db) -> Promise(#(Int, Int, Int)) {
  let a = accounts.table()
  let e = events.table()
  use accounts <- promise.await(count_rows(
    db,
    from(a) |> where(not(related(accounts.did(a)))),
  ))
  use events <- promise.await(count_rows(
    db,
    from(e) |> where(eq(events.did(e), "")),
  ))
  use retained <- promise.map(count_rows(
    db,
    from(a) |> where(related(accounts.did(a))),
  ))
  #(accounts, events, retained)
}

pub fn cleanup(db: Db) -> Promise(#(Int, Int)) {
  use tx <- transaction(db)
  let a = accounts.table()
  let e = events.table()
  use accounts <- promise.await(delete_count(
    tx,
    a,
    not(related(accounts.did(a))),
  ))
  // Legacy IDs are opaque hashes: they cannot be assigned to an account or
  // lexicon. Remove that replay-only cache; record timestamps and checkpoints
  // remain intact and make replayed mutations idempotent.
  use legacy <- promise.map(delete_count(tx, e, eq(events.did(e), "")))
  #(accounts, legacy)
}
