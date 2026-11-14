import ci/native
import gleam/bit_array
import gleam/int
import gleam/list
import gleam/result
import gleam/string

pub fn require(condition: Bool, message: String) -> Result(Nil, String) {
  case condition {
    True -> Ok(Nil)
    False -> Error(message)
  }
}

pub fn text(path: String) -> Result(String, String) {
  use bytes <- result.try(native.read(path))
  bit_array.to_string(bytes)
  |> result.map_error(fn(_) { "Invalid UTF-8: " <> path })
}

pub fn write(path: String, value: String) -> Result(Nil, String) {
  native.write(path, bit_array.from_string(value))
}

pub fn env(name: String) -> Result(String, String) {
  let value = native.env(name)
  use _ <- result.try(require(
    value != "",
    "Set " <> name <> " before running this command",
  ))
  Ok(value)
}

pub fn run(
  program: String,
  args: List(String),
  directory: String,
) -> Result(String, String) {
  let #(status, output) = native.execute(program, args, directory, False, False)
  case status {
    0 -> Ok(output)
    _ ->
      Error(program <> " failed (" <> int.to_string(status) <> "): " <> output)
  }
}

pub fn stream(
  program: String,
  args: List(String),
  directory: String,
) -> Result(Nil, String) {
  let #(status, output) = native.execute(program, args, directory, True, True)
  case status {
    0 -> Ok(Nil)
    _ ->
      Error(program <> " failed (" <> int.to_string(status) <> "): " <> output)
  }
}

pub fn all(
  items: List(a),
  function: fn(a) -> Result(Nil, String),
) -> Result(Nil, String) {
  list.try_fold(items, Nil, fn(_, item) { function(item) })
}

pub fn ascii(value: String, allowed: String) -> Bool {
  value != ""
  && list.all(string.to_graphemes(value), fn(char) {
    string.contains(allowed, char)
  })
}

pub fn tag(value: String) -> Result(Nil, String) {
  require(
    ascii(
      value,
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._+-",
    )
      && !string.starts_with(value, "-"),
    "Unsafe release tag",
  )
}

pub fn clean(value: String) -> Bool {
  !string.contains(value, "\n")
  && !string.contains(value, "\r")
  && !string.contains(value, "\u{0}")
}

pub fn path(value: String) -> Bool {
  string.starts_with(value, "/") && clean(value)
}

pub fn file_hash(path: String) -> Result(String, String) {
  use bits <- result.try(native.read(path))
  Ok(native.sha256(bits))
}

pub fn checksum(path: String, filename: String) -> Result(Nil, String) {
  use digest <- result.try(file_hash(path))
  write(path <> ".sha256", digest <> "  " <> filename <> "\n")
}

pub fn with_temp(
  prefix: String,
  task: fn(String) -> Result(a, String),
) -> Result(a, String) {
  use directory <- result.try(native.temp(prefix))
  let output = task(directory)
  let cleanup = native.remove(directory)
  use _ <- result.try(cleanup)
  output
}

pub fn indices(count: Int) -> List(Int) {
  int.range(0, count, [], fn(acc, i) { [i, ..acc] }) |> list.reverse
}
