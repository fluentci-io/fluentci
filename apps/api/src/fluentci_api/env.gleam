//// Validate process configuration before opening SQLite or network services.

import gleam/int
import gleam/list
import gleam/result
import gleam/string

pub type Mode {
  Server
  Indexer
}

pub type Env {
  Env(
    host: String,
    port: Int,
    database_url: String,
    service_did: String,
    jetstream_urls: List(String),
  )
}

@external(javascript, "./env_ffi.mjs", "get")
fn get(name: String) -> String

@external(javascript, "./env_ffi.mjs", "validHttp")
fn valid_http(value: String) -> Bool

@external(javascript, "./env_ffi.mjs", "validStream")
fn valid_stream(value: String) -> Bool

@external(javascript, "./env_ffi.mjs", "defaultStreams")
fn default_streams() -> List(String)

@external(javascript, "./env_ffi.mjs", "validDid")
fn valid_did(value: String) -> Bool

@external(javascript, "./env_ffi.mjs", "validDatabase")
fn valid_database(value: String) -> Bool

@external(javascript, "./env_ffi.mjs", "apply")
pub fn apply(config: Env) -> Nil

@external(javascript, "./env_ffi.mjs", "abort")
pub fn abort(errors: List(String)) -> Nil

fn default(value: String, fallback: String) -> String {
  case string.trim(value) {
    "" -> fallback
    value -> value
  }
}

pub fn validate(
  read: fn(String) -> String,
  mode: Mode,
) -> Result(Env, List(String)) {
  let port = read("PORT") |> default("3001") |> int.parse |> result.unwrap(0)
  let host = read("HOST") |> default("127.0.0.1")
  let database = read("DATABASE_URL") |> default("file:./data/registry.sqlite")
  let did = read("SERVICE_DID") |> default("did:web:api.fluentci.io")
  let configured_streams =
    read("JETSTREAM_URLS") |> default(read("JETSTREAM_URL")) |> string.trim
  let streams = case configured_streams {
    "" -> default_streams()
    value -> string.split(value, ",") |> list.map(string.trim) |> list.unique
  }
  let stream_setting = case string.trim(read("JETSTREAM_URLS")) {
    "" -> "JETSTREAM_URL"
    _ -> "JETSTREAM_URLS"
  }
  let required = case mode {
    Server -> ["S3_BUCKET", "S3_PUBLIC_URL"]
    Indexer -> []
  }
  let errors =
    required
    |> list.filter(fn(name) { string.trim(read(name)) == "" })
    |> list.map(fn(name) { name <> " is required" })
  let errors =
    list.append(errors, case port >= 1 && port <= 65_535 {
      True -> []
      False -> ["PORT must be an integer from 1 to 65535"]
    })
  let errors =
    list.append(errors, case valid_did(did) {
      True -> []
      False -> ["SERVICE_DID must be a valid did:web or did:plc identifier"]
    })
  let errors =
    list.append(errors, case list.all(streams, valid_stream) {
      True -> []
      False -> [stream_setting <> " must use WSS (WS is allowed on loopback)"]
    })
  let errors =
    list.append(errors, case valid_database(database) {
      True -> []
      False -> ["DATABASE_URL must identify a local SQLite file"]
    })
  let errors =
    list.append(errors, case read("JETSTREAM_ENABLED") {
      "" | "true" | "false" -> []
      _ -> ["JETSTREAM_ENABLED must be true or false"]
    })
  let errors =
    list.append(errors, case read("S3_FORCE_PATH_STYLE") {
      "" | "true" | "false" -> []
      _ -> ["S3_FORCE_PATH_STYLE must be true or false"]
    })
  let errors =
    list.append(
      errors,
      ["S3_PUBLIC_URL", "S3_ENDPOINT"]
        |> list.filter(fn(name) {
          let value = read(name)
          value != "" && !valid_http(value)
        })
        |> list.map(fn(name) {
          name
          <> " must be a credential-free HTTPS URL (HTTP is allowed on loopback)"
        }),
    )
  let errors =
    list.append(
      errors,
      case
        string.trim(read("AWS_ACCESS_KEY_ID")) == "",
        string.trim(read("AWS_SECRET_ACCESS_KEY")) == ""
      {
        True, False | False, True -> [
          "Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or use the AWS credential provider chain",
        ]
        _, _ -> []
      },
    )
  let token = read("DOWNLOAD_TRACKING_TOKEN")
  let errors =
    list.append(errors, case token == "" || valid_tracking_token(token) {
      True -> []
      False -> [
        "DOWNLOAD_TRACKING_TOKEN must contain 32–512 printable non-whitespace ASCII characters",
      ]
    })
  case errors {
    [] ->
      Ok(Env(
        host:,
        port:,
        database_url: database,
        service_did: did,
        jetstream_urls: streams,
      ))
    _ -> Error(errors)
  }
}

pub fn load(mode: Mode) -> Result(Env, List(String)) {
  validate(get, mode)
}

@external(javascript, "./env_ffi.mjs", "validTrackingToken")
fn valid_tracking_token(value: String) -> Bool
