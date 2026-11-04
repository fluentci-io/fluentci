/// Typed execution journal records. Raw log bytes remain authoritative when
/// output is not UTF-8; journal log text is the engine's display representation.
import gleam/dynamic.{type DecodeErrors, type Dynamic, DecodeError}
import gleam/list
import gleam/option.{type Option}
import gleam/result

pub type TaskStatus {
  Pending
  Running
  Ready
  Stopping
  Succeeded
  Failed
  Skipped
  Cancelled
  TimedOut
}

pub type LogStream {
  Stdout
  Stderr
  ProbeStdout
  ProbeStderr
}

pub type Kind {
  RunStarted(tasks: Int)
  TaskState(
    id: String,
    status: TaskStatus,
    cache: String,
    reason: String,
    wait_reason: Option(String),
    error: Option(String),
    exit_code: Option(Int),
    signal: Option(Int),
    duration_ms: Int,
  )
  Log(id: String, stream: LogStream, text: String)
  RunFinished(success: Bool)
}

pub type Event {
  Event(
    sequence: Int,
    elapsed_ms: Int,
    trace_id: Option(String),
    span_id: Option(String),
    kind: Kind,
  )
}

fn invalid() -> Result(a, DecodeErrors) {
  Error([
    DecodeError(
      expected: "execution journal record",
      found: "invalid value",
      path: [],
    ),
  ])
}

fn natural(data: Dynamic) -> Result(Int, DecodeErrors) {
  use value <- result.try(dynamic.int(data))
  case value >= 0 && value <= 9_007_199_254_740_991 {
    True -> Ok(value)
    False -> invalid()
  }
}

fn id(data: Dynamic) -> Result(String, DecodeErrors) {
  use value <- result.try(dynamic.string(data))
  case value == "" {
    True -> invalid()
    False -> Ok(value)
  }
}

fn status(data: Dynamic) -> Result(TaskStatus, DecodeErrors) {
  use value <- result.try(dynamic.string(data))
  case value {
    "pending" -> Ok(Pending)
    "running" -> Ok(Running)
    "ready" -> Ok(Ready)
    "stopping" -> Ok(Stopping)
    "succeeded" -> Ok(Succeeded)
    "failed" -> Ok(Failed)
    "skipped" -> Ok(Skipped)
    "cancelled" -> Ok(Cancelled)
    "timed_out" -> Ok(TimedOut)
    _ -> invalid()
  }
}

fn stream(data: Dynamic) -> Result(LogStream, DecodeErrors) {
  use value <- result.try(dynamic.string(data))
  case value {
    "stdout" -> Ok(Stdout)
    "stderr" -> Ok(Stderr)
    "probe_stdout" -> Ok(ProbeStdout)
    "probe_stderr" -> Ok(ProbeStderr)
    _ -> invalid()
  }
}

fn kind(data: Dynamic) -> Result(Kind, DecodeErrors) {
  use tag <- result.try(dynamic.field("type", dynamic.string)(data))
  case tag {
    "run_started" ->
      dynamic.field("tasks", natural)(data) |> result.map(RunStarted)
    "run_finished" ->
      dynamic.field("success", dynamic.bool)(data) |> result.map(RunFinished)
    "log" -> {
      use id <- result.try(dynamic.field("id", id)(data))
      use stream <- result.try(dynamic.field("stream", stream)(data))
      use text <- result.try(dynamic.field("text", dynamic.string)(data))
      Ok(Log(id:, stream:, text:))
    }
    "task_state" -> {
      use id <- result.try(dynamic.field("id", id)(data))
      use status <- result.try(dynamic.field("status", status)(data))
      use cache <- result.try(dynamic.field("cache", dynamic.string)(data))
      use reason <- result.try(dynamic.field("reason", dynamic.string)(data))
      use wait_reason <- result.try(dynamic.optional_field(
        "wait_reason",
        dynamic.string,
      )(data))
      use error <- result.try(dynamic.optional_field("error", dynamic.string)(
        data,
      ))
      use exit_code <- result.try(dynamic.optional_field(
        "exit_code",
        dynamic.int,
      )(data))
      use signal <- result.try(dynamic.optional_field("signal", dynamic.int)(
        data,
      ))
      use duration_ms <- result.try(dynamic.field("duration_ms", natural)(data))
      Ok(TaskState(
        id:,
        status:,
        cache:,
        reason:,
        wait_reason:,
        error:,
        exit_code:,
        signal:,
        duration_ms:,
      ))
    }
    _ -> invalid()
  }
}

fn event(data: Dynamic) -> Result(Event, DecodeErrors) {
  use sequence <- result.try(dynamic.field("sequence", natural)(data))
  use elapsed_ms <- result.try(dynamic.field("elapsed_ms", natural)(data))
  use trace_id <- result.try(dynamic.optional_field("trace_id", dynamic.string)(
    data,
  ))
  use span_id <- result.try(dynamic.optional_field("span_id", dynamic.string)(
    data,
  ))
  use kind <- result.try(kind(data))
  Ok(Event(sequence:, elapsed_ms:, trace_id:, span_id:, kind:))
}

@external(javascript, "../../host_result_ffi.mjs", "parse_lines")
fn parse_lines(
  text: String,
  ok: fn(Dynamic) -> Result(List(Event), Nil),
  error: fn() -> Result(List(Event), Nil),
) -> Result(List(Event), Nil)

/// Decode complete newline-terminated journal records. Reject unknown variants,
/// malformed fields, truncated records and non-increasing sequence numbers.
pub fn parse(text: String) -> Result(List(Event), Nil) {
  parse_lines(
    text,
    fn(data) {
      use events <- result.try(
        dynamic.list(event)(data) |> result.map_error(fn(_) { Nil }),
      )
      use _ <- result.try(
        list.try_fold(events, -1, fn(previous, event) {
          case event.sequence > previous {
            True -> Ok(event.sequence)
            False -> Error(Nil)
          }
        }),
      )
      Ok(events)
    },
    fn() { Error(Nil) },
  )
}
