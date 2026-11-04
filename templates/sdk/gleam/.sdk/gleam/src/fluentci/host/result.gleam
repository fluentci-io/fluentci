/// Typed terminal reports shared by host execution adapters.
import gleam/dict
import gleam/dynamic.{type DecodeErrors, type Dynamic, DecodeError}
import gleam/list
import gleam/option.{type Option, Some}
import gleam/result

pub type Outcome {
  Succeeded
  Failed
  Cancelled
}

pub type TaskStatus {
  TaskSucceeded
  TaskFailed
  TaskSkipped
  TaskCancelled
  TaskTimedOut
}

pub type Cache {
  Cache(outcome: String, key: Option(String), reason: String)
}

pub type TaskResult {
  TaskResult(
    id: String,
    status: TaskStatus,
    exit_code: Option(Int),
    error: Option(String),
    duration_ms: Int,
    stdout: String,
    stderr: String,
    cache: Cache,
    signal: Option(Int),
    file_result: Option(Dynamic),
    attempts: List(Attempt),
    outputs: dict.Dict(String, String),
    artifacts: dict.Dict(String, Artifact),
    allowed_failure: Bool,
    condition_skipped: Bool,
  )
}

pub type Attempt {
  Attempt(
    number: Int,
    status: TaskStatus,
    exit_code: Option(Int),
    duration_ms: Int,
    error: Option(String),
  )
}

fn attempt(data: Dynamic) -> Result(Attempt, DecodeErrors) {
  use number <- result.try(dynamic.field("number", dynamic.int)(data))
  use status <- result.try(dynamic.field("status", status)(data))
  use exit_code <- result.try(dynamic.optional_field("exit_code", dynamic.int)(
    data,
  ))
  use duration_ms <- result.try(dynamic.field("duration_ms", dynamic.int)(data))
  use error <- result.try(dynamic.optional_field("error", dynamic.string)(data))
  Ok(Attempt(number:, status:, exit_code:, duration_ms:, error:))
}

pub type Artifact {
  Artifact(path: String, size: Int, sha256: String)
}

fn artifact(data: Dynamic) -> Result(Artifact, DecodeErrors) {
  use path <- result.try(dynamic.field("path", dynamic.string)(data))
  use size <- result.try(dynamic.field("size", dynamic.int)(data))
  use sha256 <- result.try(dynamic.field("sha256", dynamic.string)(data))
  Ok(Artifact(path:, size:, sha256:))
}

pub type RunResult {
  RunResult(outcome: Option(Outcome), tasks: List(TaskResult))
}

fn invalid() -> Result(a, DecodeErrors) {
  Error([
    DecodeError(
      expected: "terminal host result",
      found: "invalid value",
      path: [],
    ),
  ])
}

fn outcome(data: Dynamic) -> Result(Outcome, DecodeErrors) {
  use value <- result.try(dynamic.string(data))
  case value {
    "succeeded" -> Ok(Succeeded)
    "failed" -> Ok(Failed)
    "cancelled" -> Ok(Cancelled)
    _ -> invalid()
  }
}

fn status(data: Dynamic) -> Result(TaskStatus, DecodeErrors) {
  use value <- result.try(dynamic.string(data))
  case value {
    "succeeded" -> Ok(TaskSucceeded)
    "failed" -> Ok(TaskFailed)
    "skipped" -> Ok(TaskSkipped)
    "cancelled" -> Ok(TaskCancelled)
    "timed_out" -> Ok(TaskTimedOut)
    _ -> invalid()
  }
}

fn cache(data: Dynamic) -> Result(Cache, DecodeErrors) {
  use outcome <- result.try(dynamic.field("outcome", dynamic.string)(data))
  use key <- result.try(dynamic.optional_field("key", dynamic.string)(data))
  use reason <- result.try(dynamic.field("reason", dynamic.string)(data))
  Ok(Cache(outcome:, key:, reason:))
}

fn task(data: Dynamic) -> Result(TaskResult, DecodeErrors) {
  use id <- result.try(dynamic.field("id", dynamic.string)(data))
  use status <- result.try(dynamic.field("status", status)(data))
  use exit_code <- result.try(dynamic.optional_field("exit_code", dynamic.int)(
    data,
  ))
  use error <- result.try(dynamic.optional_field("error", dynamic.string)(data))
  use duration_ms <- result.try(dynamic.field("duration_ms", dynamic.int)(data))
  use stdout <- result.try(dynamic.field("stdout", dynamic.string)(data))
  use stderr <- result.try(dynamic.field("stderr", dynamic.string)(data))
  use cache <- result.try(dynamic.field("cache", cache)(data))
  use file_result <- result.try(
    dynamic.optional_field("file_result", fn(value) { Ok(value) })(data),
  )
  use signal <- result.try(dynamic.optional_field("signal", dynamic.int)(data))
  use attempts <- result.try(dynamic.optional_field(
    "attempts",
    dynamic.list(attempt),
  )(data))
  use outputs <- result.try(dynamic.optional_field(
    "outputs",
    dynamic.dict(dynamic.string, dynamic.string),
  )(data))
  use artifacts <- result.try(dynamic.optional_field(
    "artifacts",
    dynamic.dict(dynamic.string, artifact),
  )(data))
  use allowed_failure <- result.try(dynamic.optional_field(
    "allowed_failure",
    dynamic.bool,
  )(data))
  use condition_skipped <- result.try(dynamic.optional_field(
    "condition_skipped",
    dynamic.bool,
  )(data))

  case duration_ms >= 0 && id != "" {
    True ->
      Ok(TaskResult(
        id:,
        status:,
        exit_code:,
        error:,
        duration_ms:,
        stdout:,
        stderr:,
        cache:,
        signal:,
        file_result:,
        attempts: option.unwrap(attempts, []),
        outputs: option.unwrap(outputs, dict.new()),
        artifacts: option.unwrap(artifacts, dict.new()),
        allowed_failure: option.unwrap(allowed_failure, False),
        condition_skipped: option.unwrap(condition_skipped, False),
      ))
    False -> invalid()
  }
}

fn report(data: Dynamic) -> Result(RunResult, DecodeErrors) {
  use tasks <- result.try(dynamic.field("tasks", dynamic.list(task))(data))
  use outcome <- result.try(dynamic.optional_field("outcome", outcome)(data))
  let ids = dict.from_list(list.map(tasks, fn(task) { #(task.id, Nil) }))
  use _ <- result.try(case dict.size(ids) == list.length(tasks) {
    True -> Ok(Nil)
    False -> invalid()
  })
  let success =
    list.all(tasks, fn(task) {
      task.status == TaskSucceeded
      || task.status == TaskSkipped
      && task.condition_skipped
      || task.allowed_failure
      && { task.status == TaskFailed || task.status == TaskTimedOut }
    })
  case outcome, success {
    Some(Succeeded), False -> invalid()
    Some(Failed), True | Some(Cancelled), True -> invalid()
    _, _ -> Ok(RunResult(outcome:, tasks:))
  }
}

@external(javascript, "../../host_result_ffi.mjs", "parse_json")
fn parse_json(
  text: String,
  ok: fn(Dynamic) -> Result(RunResult, Nil),
  error: fn() -> Result(RunResult, Nil),
) -> Result(RunResult, Nil)

/// Reject malformed/unknown/nonterminal reports. Missing outcome supports older engines.
pub fn parse(text: String) -> Result(RunResult, Nil) {
  parse_json(
    text,
    fn(data) { report(data) |> result.map_error(fn(_) { Nil }) },
    fn() { Error(Nil) },
  )
}

pub fn succeeded(report: RunResult) -> Bool {
  case report.outcome {
    Some(Succeeded) -> True
    Some(_) -> False
    _ -> list.all(report.tasks, fn(task) { task.status == TaskSucceeded })
  }
}
