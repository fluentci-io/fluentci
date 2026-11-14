import ci/common as c
import ci/native
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option
import gleam/result
import gleam/string

pub type Package {
  Package(id: String, name: String, version: String, rust: String)
}

pub type Node {
  Node(id: String, dependencies: List(String))
}

fn package_decoder() {
  use id <- decode.field("id", decode.string)
  use name <- decode.field("name", decode.string)
  use version <- decode.field("version", decode.string)
  use rust <- decode.optional_field(
    "rust_version",
    option.None,
    decode.optional(decode.string),
  )
  decode.success(Package(id, name, version, option.unwrap(rust, "")))
}

fn node_decoder() {
  use id <- decode.field("id", decode.string)
  use deps <- decode.field(
    "deps",
    decode.list(decode.field("pkg", decode.string, decode.success)),
  )
  decode.success(Node(id, deps))
}

fn graph_decoder() {
  use packages <- decode.field("packages", decode.list(package_decoder()))
  use nodes <-
    decode.at(["resolve", "nodes"], decode.list(node_decoder()))
    |> decode.then
  decode.success(#(packages, nodes))
}

fn reachable(
  pending: List(String),
  visited: List(String),
  nodes: List(Node),
) -> Result(List(String), String) {
  case pending {
    [] -> Ok(visited)
    [id, ..rest] ->
      case list.contains(visited, id) {
        True -> reachable(rest, visited, nodes)
        False -> {
          use node <- result.try(
            list.find(nodes, fn(node) { node.id == id })
            |> result.map_error(fn(_) { "Missing dependency graph node" }),
          )
          reachable(
            list.append(node.dependencies, rest),
            [id, ..visited],
            nodes,
          )
        }
      }
  }
}

pub fn supported_version(value: String) -> Bool {
  case value {
    "" -> True
    _ -> {
      let parts =
        string.split(value, ".")
        |> list.map(fn(n) { int.parse(n) |> result.unwrap(999) })
      case list.append(parts, [0, 0]) {
        [major, minor, patch, ..] ->
          major < 1 || major == 1 && { minor < 90 || minor == 90 && patch == 0 }
        _ -> False
      }
    }
  }
}

pub fn validate(
  packages: List(Package),
  nodes: List(Node),
) -> Result(Nil, String) {
  use root <- result.try(
    list.find(packages, fn(package) { package.name == "fluentci" })
    |> result.map_error(fn(_) { "Missing FluentCI root package" }),
  )
  use ids <- result.try(reachable([root.id], [], nodes))
  let selected =
    list.filter(packages, fn(package) { list.contains(ids, package.id) })
  use _ <- result.try(
    c.all(selected, fn(package) {
      c.require(
        supported_version(package.rust),
        package.name
          <> " "
          <> package.version
          <> " requires Rust "
          <> package.rust,
      )
    }),
  )
  let runtimes =
    selected
    |> list.filter(fn(package) {
      list.contains(
        ["extism", "fluentci-extism-openbsd", "wasmtime"],
        package.name,
      )
    })
    |> list.map(fn(package) { #(package.name, package.version) })
    |> list.unique
  c.require(
    list.length(runtimes) == 2
      && list.contains(runtimes, #("fluentci-extism-openbsd", "1.21.1"))
      && list.contains(runtimes, #("wasmtime", "41.0.4")),
    "Unexpected OpenBSD Wasm runtimes",
  )
}

pub fn check() -> Result(Nil, String) {
  use output <- result.try(c.run(
    "cargo",
    [
      "metadata",
      "--quiet",
      "--locked",
      "--filter-platform",
      "x86_64-unknown-openbsd",
      "--format-version",
      "1",
    ],
    native.cwd(),
  ))
  use graph <- result.try(
    json.parse(output, graph_decoder())
    |> result.map_error(fn(_) { "Invalid Cargo dependency graph" }),
  )
  validate(graph.0, graph.1)
}
