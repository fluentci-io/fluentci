//// Application queries are constructed in Gleam using typed Drizzle bindings.

import fluentci_api/db/connection
import fluentci_api/db/filters
import fluentci_api/drizzle/orm.{
  type Assignment, type Condition, type Query, all, and, asc, desc, eq,
  eq_columns, from, gt, inner_join, insert, is_null, left_join, limit, lt,
  matches, on_conflict_do_nothing, on_conflict_do_update, or, order_by, set,
  transaction, where,
}
import fluentci_api/function_metadata
import fluentci_api/lexicon/models.{
  RegistryDailyDownload, RegistryListPackagesOutput, RegistryPackageView,
}
import fluentci_api/model.{
  type Event, type Package, type Page, Account, Checkpoint, Delete, Upsert,
}
import fluentci_api/module_metadata
import fluentci_api/schema/accounts as a
import fluentci_api/schema/checkpoints as c
import fluentci_api/schema/download_days as d
import fluentci_api/schema/events as e
import fluentci_api/schema/plugin_search as fts
import fluentci_api/schema/plugins as p
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, Some}
import gleam/string

pub type Db =
  connection.Db

pub fn open() -> Promise(Db) {
  connection.open()
}

pub fn close(db: Db) -> Promise(Nil) {
  connection.close(db)
}

@external(javascript, "./query_helpers.mjs", "queryHash")
fn query_hash(query: String, author: String) -> String

@external(javascript, "./query_helpers.mjs", "decodeCursor")
fn decode_cursor(value: String, filter: String) -> #(String, String)

@external(javascript, "./query_helpers.mjs", "encodeCursor")
fn encode_cursor(time: String, uri: String, filter: String) -> String

@external(javascript, "./query_helpers.mjs", "latest")
fn latest(packages: List(Package)) -> Package

@external(javascript, "./query_helpers.mjs", "fail")
fn fail(code: String, message: String) -> a

@external(javascript, "./query_helpers.mjs", "words")
fn words(query: String) -> List(String)

fn package(row: p.Row) -> Package {
  let assert Some(cid) = row.cid
  let assert Some(name) = row.name
  let assert Some(description) = row.description
  let assert Some(version) = row.version
  let assert Some(published_at) = row.published_at
  let assert Some(license) = row.license
  let assert Some(url) = row.url
  let assert Some(sha256) = row.sha256
  let assert Some(size) = row.size
  RegistryPackageView(
    name,
    description,
    version,
    published_at,
    row.author,
    license,
    url,
    sha256,
    option.map(row.functions, function_metadata.from_string),
    size,
    row.repository,
    row.logo,
    row.subdir,
    option.map(row.topics, module_metadata.from_string),
    row.readme_url,
    option.map(row.os, module_metadata.from_string),
    option.map(row.arch, module_metadata.from_string),
    Some(row.downloads),
    None,
    row.uri,
    cid,
  )
}

fn visible() -> Query(p.Row) {
  let plugins = p.table()
  let accounts = a.table()
  from(plugins)
  |> left_join(accounts, eq_columns(p.author(plugins), a.did(accounts)))
}

fn visibility() -> Condition {
  and([
    eq(p.deleted(p.table()), False),
    or([is_null(a.active(a.table())), eq(a.active(a.table()), True)]),
  ])
}

pub fn list_packages(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
) -> Promise(Page) {
  list_filtered(db, query, author, count, cursor_value, "")
}

pub fn search_packages(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  rsql: String,
) -> Promise(Page) {
  list_filtered(db, query, author, count, cursor_value, rsql)
}

fn list_filtered(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  rsql: String,
) -> Promise(Page) {
  let plugins = p.table()
  let filter = query_hash(query, author <> "\n" <> rsql)
  let conditions = [visibility(), filters.parse(rsql)]
  let conditions = case author {
    "" -> conditions
    _ -> [eq(p.author(plugins), author), ..conditions]
  }
  let conditions = case cursor_value {
    "" -> conditions
    value -> {
      let #(time, uri) = decode_cursor(value, filter)
      [
        or([
          lt(p.published_at(plugins), Some(time)),
          and([eq(p.published_at(plugins), Some(time)), gt(p.uri(plugins), uri)]),
        ]),
        ..conditions
      ]
    }
  }
  let #(selection, conditions) = case query {
    "" -> #(visible(), conditions)
    _ -> {
      let search = fts.table()
      let expression =
        words(query)
        |> list.map(fn(word) { "\"" <> word <> "\"*" })
        |> string.join(" AND ")
      let condition = case expression {
        "" -> or([])
        _ -> matches(search, expression)
      }
      #(
        visible()
          |> inner_join(search, eq_columns(p.uri(plugins), fts.uri(search))),
        [condition, ..conditions],
      )
    }
  }
  let selection =
    selection
    |> where(and(conditions))
    |> order_by([desc(p.published_at(plugins)), asc(p.uri(plugins))])
    |> limit(count + 1)
  use rows <- promise.map(all(db, selection))
  let packages = rows |> list.take(count) |> list.map(package)
  let cursor = case list.length(rows) > count, list.last(packages) {
    True, Ok(last) -> Some(encode_cursor(last.published_at, last.uri, filter))
    _, _ -> None
  }
  RegistryListPackagesOutput(packages, cursor)
}

pub fn actor_packages(
  db: Db,
  actor: String,
  count: Int,
  cursor_value: String,
) -> Promise(Page) {
  case actor {
    "" -> fail("InvalidRequest", "Actor is required")
    _ -> list_packages(db, "", actor, count, cursor_value)
  }
}

pub fn get_package(
  db: Db,
  name: String,
  version: String,
  author: String,
) -> Promise(Package) {
  let plugins = p.table()
  let conditions = [visibility(), eq(p.name(plugins), Some(name))]
  let conditions = case author {
    "" -> conditions
    _ -> [eq(p.author(plugins), author), ..conditions]
  }
  let conditions = case version {
    "" -> conditions
    _ -> [eq(p.version(plugins), Some(version)), ..conditions]
  }
  use rows <- promise.await(all(
    db,
    visible() |> where(and(conditions)) |> limit(1001),
  ))
  let selected = case rows {
    [] -> fail("PackageNotFound", "Package not found")
    _ -> {
      case
        rows |> list.map(fn(row) { row.author }) |> list.unique |> list.length
      {
        1 -> Nil
        _ -> fail("AmbiguousPackage", "Specify author to disambiguate packages")
      }
      case list.length(rows) > 1000 {
        True ->
          fail("InvalidRequest", "Specify an explicit version for this package")
        False -> latest(list.map(rows, package))
      }
    }
  }
  let days = recent_days()
  let table = d.table()
  use history <- promise.map(all(
    db,
    from(table)
      |> where(
        and([
          eq(d.uri(table), selected.uri),
          gt(d.date(table), day_before_week()),
          lt(d.date(table), tomorrow()),
        ]),
      )
      |> order_by([asc(d.date(table))]),
  ))
  let daily_downloads = case history {
    [] -> None
    _ ->
      Some(
        list.map(days, fn(date) {
          let count =
            history
            |> list.filter(fn(row) { row.date == date })
            |> list.fold(0, fn(total, row) { total + row.downloads })
          RegistryDailyDownload(date, count)
        }),
      )
  }
  RegistryPackageView(..selected, daily_downloads: daily_downloads)
}

@external(javascript, "./query_helpers.mjs", "recentDays")
fn recent_days() -> List(String)

@external(javascript, "./query_helpers.mjs", "dayBeforeWeek")
fn day_before_week() -> String

@external(javascript, "./query_helpers.mjs", "tomorrow")
fn tomorrow() -> String

pub fn cursor(db: Db) -> Promise(Int) {
  let checkpoints = c.table()
  use rows <- promise.map(all(
    db,
    from(checkpoints)
      |> where(eq(c.source(checkpoints), connection.source(db)))
      |> limit(1),
  ))
  case rows {
    [row, ..] -> row.time_us
    [] -> 0
  }
}

fn save_checkpoint(db: Db, time: Int) -> Promise(Nil) {
  let table = c.table()
  let values = [
    set(c.source(table), connection.source(db)),
    set(c.time_us(table), time),
  ]
  use _ <- promise.map(all(
    db,
    insert(table, values)
      |> on_conflict_do_update(
        c.source(table),
        values,
        lt(c.time_us(table), time),
      ),
  ))
  Nil
}

fn package_values(plugin: Package, time: Int) -> List(Assignment) {
  let table = p.table()
  [
    set(p.uri(table), plugin.uri),
    set(p.cid(table), Some(plugin.cid)),
    set(p.author(table), plugin.author),
    set(p.name(table), Some(plugin.name)),
    set(p.description(table), Some(plugin.description)),
    set(p.version(table), Some(plugin.version)),
    set(p.published_at(table), Some(plugin.published_at)),
    set(p.license(table), Some(plugin.license)),
    set(p.url(table), Some(plugin.url)),
    set(p.sha256(table), Some(plugin.sha256)),
    set(p.size(table), Some(plugin.size)),
    set(p.repository(table), plugin.repository),
    set(p.logo(table), plugin.logo),
    set(p.subdir(table), plugin.subdir),
    set(p.readme_url(table), plugin.readme_url),
    set(p.topics(table), option.map(plugin.topics, module_metadata.to_string)),
    set(p.os(table), option.map(plugin.os, module_metadata.to_string)),
    set(p.arch(table), option.map(plugin.arch, module_metadata.to_string)),
    set(
      p.functions(table),
      option.map(plugin.functions, function_metadata.to_string),
    ),
    set(p.deleted(table), False),
    set(p.event_time(table), time),
  ]
}

fn mutate(db: Db, event: Event) -> Promise(Nil) {
  case event {
    Upsert(plugin, time, _) -> {
      let table = p.table()
      let values = package_values(plugin, time)
      use _ <- promise.map(all(
        db,
        insert(table, values)
          |> on_conflict_do_update(
            p.uri(table),
            values,
            lt(p.event_time(table), time),
          ),
      ))
      Nil
    }
    Delete(uri, author, time, _) -> {
      let table = p.table()
      let changes = [
        set(p.deleted(table), True),
        set(p.event_time(table), time),
      ]
      let values = [
        set(p.uri(table), uri),
        set(p.author(table), author),
        ..changes
      ]
      use _ <- promise.map(all(
        db,
        insert(table, values)
          |> on_conflict_do_update(
            p.uri(table),
            changes,
            lt(p.event_time(table), time),
          ),
      ))
      Nil
    }
    Account(author, active, time, _) -> {
      let table = a.table()
      let values = [
        set(a.did(table), author),
        set(a.active(table), active),
        set(a.event_time(table), time),
      ]
      use _ <- promise.map(all(
        db,
        insert(table, values)
          |> on_conflict_do_update(
            a.did(table),
            values,
            lt(a.event_time(table), time),
          ),
      ))
      Nil
    }
    Checkpoint(_) -> promise.resolve(Nil)
  }
}

pub fn apply_event(db: Db, event: Event) -> Promise(Nil) {
  let #(time, id) = case event {
    Upsert(_, time, id) | Delete(_, _, time, id) | Account(_, _, time, id) -> #(
      time,
      Some(id),
    )
    Checkpoint(time) -> #(time, None)
  }
  use tx <- transaction(db)
  let apply = case id {
    None -> promise.resolve(Nil)
    Some(id) -> {
      let table = e.table()
      use inserted <- promise.await(all(
        tx,
        insert(table, [set(e.id(table), id)]) |> on_conflict_do_nothing,
      ))
      case inserted {
        [] -> promise.resolve(Nil)
        _ -> mutate(tx, event)
      }
    }
  }
  use _ <- promise.await(apply)
  save_checkpoint(tx, time)
}
