//// Atomically update per-version totals and UTC buckets once per proxy event.

import fluentci_api/db/client.{type Db}
import fluentci_api/drizzle/orm.{
  all, and, eq, increment, insert, on_conflict_do_nothing,
  on_conflict_do_update_columns, set, transaction, update, where,
}
import fluentci_api/lexicon/models.{
  type RegistryRecordDownloadOutput, RegistryRecordDownloadOutput,
}
import fluentci_api/schema/download_days as d
import fluentci_api/schema/download_events as e
import fluentci_api/schema/plugins as p
import gleam/javascript/promise.{type Promise}
import gleam/option.{Some}

pub fn record(
  db: Db,
  author: String,
  name: String,
  version: String,
  event_id: String,
  day: String,
) -> Promise(RegistryRecordDownloadOutput) {
  use tx <- transaction(db)
  use plugin <- promise.await(client.get_package(tx, name, version, author))
  let events = e.table()
  use inserted <- promise.await(all(
    tx,
    insert(events, [
      set(e.event_id(events), event_id),
      set(e.uri(events), plugin.uri),
      set(e.date(events), day),
    ])
      |> on_conflict_do_nothing,
  ))
  case inserted {
    [] -> {
      let assert Some(total) = plugin.downloads
      promise.resolve(RegistryRecordDownloadOutput(0, total))
    }
    _ -> {
      let days = d.table()
      use _ <- promise.await(all(
        tx,
        insert(days, [
          set(d.uri(days), plugin.uri),
          set(d.date(days), day),
          set(d.downloads(days), 1),
        ])
          |> on_conflict_do_update_columns(
            [d.uri(days), d.date(days)],
            [increment(d.downloads(days), 1)],
            and([]),
          ),
      ))
      let plugins = p.table()
      use rows <- promise.map(all(
        tx,
        update(plugins, [increment(p.downloads(plugins), 1)])
          |> where(eq(p.uri(plugins), plugin.uri)),
      ))
      let assert [row] = rows
      RegistryRecordDownloadOutput(1, row.downloads)
    }
  }
}
