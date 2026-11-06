//// RSQL parsing is pure FFI; all SQL construction stays in Gleam.

import fluentci_api/drizzle/orm.{
  type Condition, and, eq, is_null, json_contains, not, or,
}
import fluentci_api/schema/plugins as p
import gleam/list
import gleam/option.{Some}

pub type Filter {
  All(left: Filter, right: Filter)
  Any(left: Filter, right: Filter)
  Match(field: String, exclude: Bool, values: List(String))
}

@external(javascript, "./filters_ffi.mjs", "parseFilter")
fn parse_filter(value: String) -> Filter

pub fn parse(value: String) -> Condition {
  case value {
    "" -> and([])
    _ -> condition(parse_filter(value))
  }
}

fn condition(filter: Filter) -> Condition {
  case filter {
    All(left, right) -> and([condition(left), condition(right)])
    Any(left, right) -> or([condition(left), condition(right)])
    Match(field, exclude, values) -> {
      let table = p.table()
      let matches =
        values
        |> list.map(fn(value) {
          case field {
            "os" -> json_contains(p.os(table), value)
            "arch" -> json_contains(p.arch(table), value)
            "topics" -> json_contains(p.topics(table), value)
            "author" -> eq(p.author(table), value)
            "name" -> eq(p.name(table), Some(value))
            "version" -> eq(p.version(table), Some(value))
            "license" -> eq(p.license(table), Some(value))
            _ -> or([])
          }
        })
        |> or
      case exclude {
        False -> matches
        True -> {
          let absent = case field {
            "name" -> is_null(p.name(table))
            "version" -> is_null(p.version(table))
            "license" -> is_null(p.license(table))
            _ -> or([])
          }
          or([absent, not(matches)])
        }
      }
    }
  }
}
