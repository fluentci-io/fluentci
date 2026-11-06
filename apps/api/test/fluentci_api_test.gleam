import fluentci_api/env
import gleam/list
import gleeunit
import gleeunit/should

pub fn main() {
  gleeunit.main()
}

fn settings(name: String) -> String {
  case name {
    "S3_BUCKET" -> "plugins"
    "S3_PUBLIC_URL" -> "https://plugins.fluentci.io"
    _ -> ""
  }
}

pub fn valid_environment_test() {
  env.validate(settings, env.Server) |> should.be_ok
}

pub fn missing_required_environment_test() {
  let assert Error(errors) = env.validate(fn(_) { "" }, env.Server)
  errors |> should.equal(["S3_BUCKET is required", "S3_PUBLIC_URL is required"])
}

pub fn indexer_does_not_require_upload_credentials_test() {
  env.validate(fn(_) { "" }, env.Indexer) |> should.be_ok
}

pub fn invalid_port_and_incomplete_credentials_test() {
  let read = fn(name) {
    case name {
      "PORT" -> "99999"
      "AWS_ACCESS_KEY_ID" -> "present"
      _ -> settings(name)
    }
  }
  let assert Error(errors) = env.validate(read, env.Server)
  errors
  |> should.equal([
    "PORT must be an integer from 1 to 65535",
    "Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or use the AWS credential provider chain",
  ])
}

pub fn invalid_configuration_is_reported_together_test() {
  let read = fn(name) {
    case name {
      "PORT" -> "not-a-port"
      "DATABASE_URL" -> "file:"
      "SERVICE_DID" -> "fluentci.io"
      "JETSTREAM_URL" -> "ws://remote.example/subscribe"
      "JETSTREAM_ENABLED" -> "yes"
      "S3_FORCE_PATH_STYLE" -> "1"
      "S3_PUBLIC_URL" -> "https://user:secret@example.com"
      "S3_ENDPOINT" -> "http://remote.example"
      _ -> settings(name)
    }
  }
  let assert Error(errors) = env.validate(read, env.Server)
  errors
  |> should.equal([
    "PORT must be an integer from 1 to 65535",
    "SERVICE_DID must be a valid did:web or did:plc identifier",
    "JETSTREAM_URL must use WSS (WS is allowed on loopback)",
    "DATABASE_URL must identify a local SQLite file",
    "JETSTREAM_ENABLED must be true or false",
    "S3_FORCE_PATH_STYLE must be true or false",
    "S3_PUBLIC_URL must be a credential-free HTTPS URL (HTTP is allowed on loopback)",
    "S3_ENDPOINT must be a credential-free HTTPS URL (HTTP is allowed on loopback)",
  ])
}

pub fn loopback_services_are_allowed_test() {
  let read = fn(name) {
    case name {
      "S3_ENDPOINT" -> "http://127.0.0.1:9000"
      "JETSTREAM_URL" -> "ws://localhost:6009/subscribe"
      _ -> settings(name)
    }
  }
  env.validate(read, env.Server) |> should.be_ok
}

pub fn memory_database_is_rejected_test() {
  let read = fn(name) {
    case name {
      "DATABASE_URL" -> "file::memory:"
      _ -> settings(name)
    }
  }
  let assert Error(errors) = env.validate(read, env.Indexer)
  errors |> should.equal(["DATABASE_URL must identify a local SQLite file"])
}

pub fn four_jetstreams_are_enabled_by_default_test() {
  let assert Ok(config) = env.validate(settings, env.Server)
  config.jetstream_urls |> list.length |> should.equal(4)
}

pub fn jetstream_list_overrides_legacy_url_and_removes_duplicates_test() {
  let read = fn(name) {
    case name {
      "JETSTREAM_URLS" ->
        " wss://east.example/subscribe, wss://west.example/subscribe,wss://east.example/subscribe "
      "JETSTREAM_URL" -> "not-used"
      _ -> settings(name)
    }
  }
  let assert Ok(config) = env.validate(read, env.Server)
  config.jetstream_urls
  |> should.equal([
    "wss://east.example/subscribe",
    "wss://west.example/subscribe",
  ])
}

pub fn every_jetstream_url_is_validated_test() {
  let read = fn(name) {
    case name {
      "JETSTREAM_URLS" ->
        "wss://east.example/subscribe,ws://remote.example/subscribe,"
      _ -> settings(name)
    }
  }
  let assert Error(errors) = env.validate(read, env.Server)
  errors
  |> should.equal(["JETSTREAM_URLS must use WSS (WS is allowed on loopback)"])
}

pub fn legacy_jetstream_override_selects_one_source_test() {
  let read = fn(name) {
    case name {
      "JETSTREAM_URL" -> "ws://localhost:6009/subscribe"
      _ -> settings(name)
    }
  }
  let assert Ok(config) = env.validate(read, env.Indexer)
  config.jetstream_urls |> should.equal(["ws://localhost:6009/subscribe"])
}

pub fn download_tracking_token_is_optional_but_must_be_strong_when_configured_test() {
  let weak = fn(name) {
    case name {
      "DOWNLOAD_TRACKING_TOKEN" -> "short"
      _ -> settings(name)
    }
  }
  env.validate(weak, env.Server) |> should.be_error
  let strong = fn(name) {
    case name {
      "DOWNLOAD_TRACKING_TOKEN" ->
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      _ -> settings(name)
    }
  }
  env.validate(strong, env.Server) |> should.be_ok
}
