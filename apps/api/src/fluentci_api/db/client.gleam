//// Application queries are constructed in Gleam using typed Drizzle bindings.

import fluentci_api/db/connection
import fluentci_api/db/filters
import fluentci_api/drizzle/orm.{
  type Assignment, type Condition, type Query, alias, all, and, asc,
  count_distinct_where, count_rows, desc, eq, eq_columns, exists, from,
  function_compare, gt, inner_join, insert, is_null, left_join, limit, lt,
  lt_columns, matches, not_exists, on_conflict_do_nothing, on_conflict_do_update,
  or, order_by, project, set, sum_where, transaction, where,
}
import fluentci_api/function_metadata
import fluentci_api/lexicon/models.{
  RegistryDailyDownload, RegistryListPackagesOutput, RegistryPackageView,
}
import fluentci_api/model.{
  type Event, type Package, type Page, Account, Checkpoint, Delete, Like, Unlike,
  Upsert,
}
import fluentci_api/module_metadata
import fluentci_api/schema/accounts as a
import fluentci_api/schema/checkpoints as c
import fluentci_api/schema/download_days as d
import fluentci_api/schema/events as e
import fluentci_api/schema/likes
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
fn decode_cursor(
  value: String,
  filter: String,
) -> #(String, String, Int, String)

@external(javascript, "./query_helpers.mjs", "encodeCursor")
fn encode_cursor(
  time: String,
  uri: String,
  filter: String,
  downloads: Int,
  name: String,
) -> String

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
    Some(row.likes_count),
  )
}

fn visible() -> Query(p.Row) {
  let plugins = p.table()
  let accounts = a.table()
  let liked = likes.table()
  let inactive = alias(accounts, "inactive_liker")
  let subject_plugin = alias(plugins, "liked_plugin")
  from(plugins)
  |> left_join(accounts, eq_columns(p.author(plugins), a.did(accounts)))
  |> project(
    "likes_count",
    count_distinct_where(
      liked,
      likes.actor(liked),
      and([
        eq(likes.active(liked), True),
        // A strong reference must name an indexed plugin record. A metadata
        // revision may change its current CID without invalidating older likes.
        exists(
          from(subject_plugin)
          |> where(
            and([
              eq_columns(p.uri(subject_plugin), likes.subject_uri(liked)),
              eq(p.deleted(subject_plugin), False),
            ]),
          ),
        ),
        eq_columns(likes.subject_author(liked), p.author(plugins)),
        eq_columns(likes.name(liked), p.name(plugins)),
        not_exists(
          from(inactive)
          |> where(
            and([
              eq_columns(a.did(inactive), likes.actor(liked)),
              eq(a.active(inactive), False),
            ]),
          ),
        ),
      ]),
    ),
  )
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
  list_filtered(db, query, author, count, cursor_value, "", False, "downloads")
}

pub fn search_packages(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  rsql: String,
) -> Promise(Page) {
  list_filtered(
    db,
    query,
    author,
    count,
    cursor_value,
    rsql,
    False,
    "downloads",
  )
}

pub fn list_packages_sorted(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  sort: String,
  newest_only: Bool,
) -> Promise(Page) {
  list_filtered(db, query, author, count, cursor_value, "", newest_only, sort)
}

pub fn search_packages_sorted(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  rsql: String,
  sort: String,
  newest_only: Bool,
) -> Promise(Page) {
  list_filtered(db, query, author, count, cursor_value, rsql, newest_only, sort)
}

fn list_filtered(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  rsql: String,
  newest_only: Bool,
  sort: String,
) -> Promise(Page) {
  list_filtered_for_actor(
    db,
    query,
    author,
    count,
    cursor_value,
    rsql,
    newest_only,
    sort,
    "",
  )
}

fn list_filtered_for_actor(
  db: Db,
  query: String,
  author: String,
  count: Int,
  cursor_value: String,
  rsql: String,
  newest_only: Bool,
  sort: String,
  liked_actor: String,
) -> Promise(Page) {
  let plugins = p.table()
  let downloads = case newest_only {
    False -> p.downloads(plugins)
    True -> {
      let releases = alias(plugins, "download_releases")
      sum_where(
        releases,
        p.downloads(releases),
        and([
          eq(p.deleted(releases), False),
          eq_columns(p.author(releases), p.author(plugins)),
          eq_columns(p.name(releases), p.name(plugins)),
        ]),
      )
    }
  }
  let sort = case sort {
    "" | "downloads" -> "downloads"
    "newest" | "oldest" | "name" -> sort
    _ ->
      fail(
        "InvalidRequest",
        "Unknown sort; use downloads, newest, oldest, or name",
      )
  }
  let filter =
    query_hash(
      query,
      author
        <> "\n"
        <> rsql
        <> "\nliked:"
        <> liked_actor
        <> "\nsort:"
        <> sort
        <> case newest_only {
        True -> "\nlatest"
        False -> ""
      },
    )
  let conditions = [visibility(), filters.parse(rsql)]
  let conditions = case liked_actor {
    "" -> conditions
    actor -> [actor_like(actor), ..conditions]
  }
  let conditions = case newest_only {
    True -> [newest_version(), ..conditions]
    False -> conditions
  }
  let conditions = case author {
    "" -> conditions
    _ -> [eq(p.author(plugins), author), ..conditions]
  }
  let conditions = case cursor_value {
    "" -> conditions
    value -> {
      let #(time, uri, cursor_downloads, name) = decode_cursor(value, filter)
      let after_time =
        or([
          lt(p.published_at(plugins), Some(time)),
          and([eq(p.published_at(plugins), Some(time)), gt(p.uri(plugins), uri)]),
        ])
      let after = case sort {
        "downloads" ->
          or([
            lt(downloads, cursor_downloads),
            and([eq(downloads, cursor_downloads), after_time]),
          ])
        "name" ->
          or([
            gt(p.name(plugins), Some(name)),
            and([eq(p.name(plugins), Some(name)), after_time]),
          ])
        "oldest" ->
          or([
            gt(p.published_at(plugins), Some(time)),
            and([
              eq(p.published_at(plugins), Some(time)),
              gt(p.uri(plugins), uri),
            ]),
          ])
        _ -> after_time
      }
      [after, ..conditions]
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
  let orders = case sort {
    "downloads" -> [
      desc(downloads),
      desc(p.published_at(plugins)),
      asc(p.uri(plugins)),
    ]
    "name" -> [
      asc(p.name(plugins)),
      desc(p.published_at(plugins)),
      asc(p.uri(plugins)),
    ]
    "oldest" -> [asc(p.published_at(plugins)), asc(p.uri(plugins))]
    _ -> [desc(p.published_at(plugins)), asc(p.uri(plugins))]
  }
  let selection =
    selection
    |> project("downloads", downloads)
    |> where(and(conditions))
    |> order_by(orders)
    |> limit(count + 1)
  use rows <- promise.map(all(db, selection))
  let packages = rows |> list.take(count) |> list.map(package)
  let cursor = case list.length(rows) > count, list.last(packages) {
    True, Ok(last) ->
      Some(encode_cursor(
        last.published_at,
        last.uri,
        filter,
        option.unwrap(last.downloads, 0),
        last.name,
      ))
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
      // A delete tombstone may arrive before the first publication. Populate
      // unknown fields once, then keep the artifact identity through updates
      // and delete/recreate events while allowing descriptive metadata edits.
      use existing <- promise.await(all(
        db,
        from(table) |> where(eq(p.uri(table), plugin.uri)) |> limit(1),
      ))
      let plugin = case existing {
        [original, ..] ->
          RegistryPackageView(
            ..plugin,
            url: option.unwrap(original.url, plugin.url),
            sha256: option.unwrap(original.sha256, plugin.sha256),
            version: option.unwrap(original.version, plugin.version),
          )
        [] -> plugin
      }
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
    // Published package records are retained even if removed from the PDS.
    // apply_event still records the event ID and advances the source checkpoint.
    Delete(_, _, _, _) -> promise.resolve(Nil)
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
    Like(uri, actor, subject_author, name, subject_uri, subject_cid, time, _) -> {
      let table = likes.table()
      let values = [
        set(likes.uri(table), uri),
        set(likes.actor(table), actor),
        set(likes.subject_author(table), subject_author),
        set(likes.name(table), Some(name)),
        set(likes.subject_uri(table), subject_uri),
        set(likes.subject_cid(table), subject_cid),
        set(likes.active(table), True),
        set(likes.event_time(table), time),
      ]
      use _ <- promise.map(all(
        db,
        insert(table, values)
          |> on_conflict_do_update(
            likes.uri(table),
            values,
            lt(likes.event_time(table), time),
          ),
      ))
      Nil
    }
    Unlike(uri, actor, time, _) -> {
      let table = likes.table()
      let changes = [
        set(likes.active(table), False),
        set(likes.event_time(table), time),
      ]
      use _ <- promise.map(all(
        db,
        insert(table, [
          set(likes.uri(table), uri),
          set(likes.actor(table), actor),
          set(likes.subject_author(table), ""),
          set(likes.name(table), None),
          ..changes
        ])
          |> on_conflict_do_update(
            likes.uri(table),
            changes,
            lt(likes.event_time(table), time),
          ),
      ))
      Nil
    }
    Checkpoint(_) -> promise.resolve(Nil)
  }
}

pub fn apply_event(db: Db, event: Event) -> Promise(Nil) {
  let #(time, id) = case event {
    Upsert(_, time, id)
    | Delete(_, _, time, id)
    | Account(_, _, time, id)
    | Like(_, _, _, _, _, _, time, id)
    | Unlike(_, _, time, id) -> #(time, Some(id))
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

fn newest_version() -> Condition {
  let plugins = p.table()
  let newer = alias(plugins, "newer_plugin")
  not_exists(
    from(newer)
    |> where(
      and([
        eq(p.deleted(newer), False),
        eq_columns(p.author(newer), p.author(plugins)),
        eq_columns(p.name(newer), p.name(plugins)),
        or([
          function_compare(
            "semver_compare",
            p.version(newer),
            p.version(plugins),
            1,
          ),
          and([
            function_compare(
              "semver_compare",
              p.version(newer),
              p.version(plugins),
              0,
            ),
            lt_columns(p.uri(newer), p.uri(plugins)),
          ]),
        ]),
      ]),
    ),
  )
}

pub fn actor_profile_packages(
  db: Db,
  actor: String,
  query: String,
  newest_only: Bool,
  count: Int,
  cursor: String,
) -> Promise(models.RegistryGetActorPackagesOutput) {
  actor_profile_packages_sorted(
    db,
    actor,
    query,
    newest_only,
    count,
    cursor,
    "downloads",
  )
}

pub fn actor_profile_packages_sorted(
  db: Db,
  actor: String,
  query: String,
  newest_only: Bool,
  count: Int,
  cursor: String,
  sort: String,
) -> Promise(models.RegistryGetActorPackagesOutput) {
  case actor {
    "" -> fail("InvalidRequest", "Actor is required")
    _ -> Nil
  }
  let conditions = [visibility(), eq(p.author(p.table()), actor)]
  let conditions = case newest_only {
    True -> [newest_version(), ..conditions]
    False -> conditions
  }
  let releases = alias(p.table(), "actor_download_releases")
  let downloads =
    sum_where(
      releases,
      p.downloads(releases),
      and([
        eq(p.deleted(releases), False),
        eq(p.author(releases), actor),
      ]),
    )
  use download_rows <- promise.await(all(
    db,
    visible()
      |> where(and([visibility(), eq(p.author(p.table()), actor)]))
      |> project("downloads", downloads)
      |> limit(1),
  ))
  let total_downloads = case download_rows {
    [row, ..] -> row.downloads
    [] -> 0
  }
  use total <- promise.await(count_rows(db, visible() |> where(and(conditions))))
  use page <- promise.map(list_filtered(
    db,
    query,
    actor,
    count,
    cursor,
    "",
    newest_only,
    sort,
  ))
  models.RegistryGetActorPackagesOutput(
    packages: page.packages,
    cursor: page.cursor,
    total: Some(total),
    total_downloads: Some(total_downloads),
  )
}

fn actor_like(actor: String) -> Condition {
  let liked = likes.table()
  let subject = alias(p.table(), "actor_liked_subject")
  let account = alias(a.table(), "actor_liker_account")
  exists(
    from(liked)
    |> where(
      and([
        eq(likes.actor(liked), actor),
        eq(likes.active(liked), True),
        eq_columns(likes.subject_author(liked), p.author(p.table())),
        eq_columns(likes.name(liked), p.name(p.table())),
        exists(
          from(subject)
          |> where(
            and([
              eq_columns(p.uri(subject), likes.subject_uri(liked)),
              eq(p.deleted(subject), False),
            ]),
          ),
        ),
        not_exists(
          from(account)
          |> where(
            and([
              eq(a.did(account), actor),
              eq(a.active(account), False),
            ]),
          ),
        ),
      ]),
    ),
  )
}

pub fn actor_liked_packages(
  db: Db,
  actor: String,
  query: String,
  count: Int,
  cursor: String,
  sort: String,
) -> Promise(models.RegistryGetActorPackagesOutput) {
  use total <- promise.await(count_rows(
    db,
    visible() |> where(and([visibility(), newest_version(), actor_like(actor)])),
  ))
  use page <- promise.map(list_filtered_for_actor(
    db,
    query,
    "",
    count,
    cursor,
    "",
    True,
    sort,
    actor,
  ))
  models.RegistryGetActorPackagesOutput(
    packages: page.packages,
    cursor: page.cursor,
    total: Some(total),
    total_downloads: None,
  )
}
