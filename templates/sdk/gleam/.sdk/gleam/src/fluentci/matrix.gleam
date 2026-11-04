/// Pure matrix expansion. Named cases preserve typed values; IDs remain stable.
import fluentci/host
import fluentci/host/result as reports
import gleam/list
import gleam/result
import gleam/string

pub opaque type Case(a) {
  Case(key: String, value: a)
}

pub type MatrixError {
  InvalidName
  TooManyCases
  DuplicateOrEmptyCase
}

@external(javascript, "../matrix_ffi.mjs", "component")
fn component(value: String) -> String

pub fn named(name: String, value: a) -> Case(a) {
  Case(component(name), value)
}

pub fn axis(name: String, values: List(String)) -> List(Case(String)) {
  list.map(values, fn(value) {
    Case(component(name) <> "=" <> component(value), value)
  })
}

pub fn product(
  left: List(Case(a)),
  right: List(Case(b)),
) -> Result(List(Case(#(a, b))), MatrixError) {
  case list.length(left) * list.length(right) > 4096 {
    True -> Error(TooManyCases)
    False ->
      Ok(
        list.flat_map(left, fn(a) {
          list.map(right, fn(b) {
            Case(a.key <> "," <> b.key, #(a.value, b.value))
          })
        }),
      )
  }
}

pub fn include(cases: List(Case(a)), extra: List(Case(a))) -> List(Case(a)) {
  list.append(cases, extra)
}

pub fn exclude(
  cases: List(Case(a)),
  predicate: fn(a) -> Bool,
) -> List(Case(a)) {
  list.filter(cases, fn(c) { !predicate(c.value) })
}

@external(javascript, "../matrix_ffi.mjs", "valid_name")
fn valid_name(name: String) -> Bool

pub fn matrix(
  name: String,
  cases: List(Case(a)),
  build: fn(a) -> host.Task,
) -> Result(List(host.Task), MatrixError) {
  let keys = list.map(cases, fn(c) { c.key })
  case
    valid_name(name),
    list.length(cases) > 4096,
    list.any(keys, fn(key) {
      string.is_empty(key) || string.contains(key, "\u{0000}")
    })
    || list.length(list.unique(keys)) != list.length(keys)
  {
    False, _, _ -> Error(InvalidName)
    _, True, _ -> Error(TooManyCases)
    _, _, True -> Error(DuplicateOrEmptyCase)
    _, _, _ ->
      Ok(
        list.map(cases, fn(c) {
          host.with_id(build(c.value), name <> "[" <> c.key <> "]")
        }),
      )
  }
}

pub fn after_jobs(task: host.Task, parents: List(host.Task)) -> host.Task {
  host.after_jobs(task, parents)
}

pub fn parallel(tasks: List(host.Task), jobs: Int) -> host.Plan {
  host.plan(tasks) |> host.with_jobs(jobs)
}

@external(javascript, "../matrix_ffi.mjs", "execute_plan")
fn execute_plan(
  plan: String,
  directory: String,
  ok: fn(String) -> Result(String, String),
  error: fn(String) -> Result(String, String),
) -> Result(String, String)

pub fn run(
  plan: host.Plan,
  directory: String,
) -> Result(reports.RunResult, String) {
  use encoded <- result.try(
    host.compile(plan) |> result.map_error(fn(_) { "Invalid execution plan" }),
  )
  use response <- result.try(execute_plan(encoded, directory, Ok, Error))
  reports.parse(response)
  |> result.map_error(fn(_) { "Invalid terminal plan report" })
}
