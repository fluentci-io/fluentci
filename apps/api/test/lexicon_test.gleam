import fluentci_api/lexicon/models
import gleam/json
import gleam/option.{None, Some}
import gleeunit/should

pub fn generated_encoder_omits_absent_optional_fields_test() {
  models.RegistryGetPackageParameters("hello", None, None)
  |> models.encode_registry_get_package_parameters
  |> json.to_string
  |> should.equal("{\"name\":\"hello\"}")
}

pub fn generated_encoder_preserves_json_field_names_test() {
  models.Plugin(
    name: "hello",
    description: "Build pipeline",
    version: "1.0.0",
    published_at: "2026-11-05T00:00:00Z",
    author: "did:plc:abcdefghijklmnopqrstuvwx",
    license: "MIT",
    url: "https://plugins.example/hello.wasm",
    sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    size: 8,
    functions: None,
    repository: None,
    logo: None,
    subdir: None,
    topics: None,
    readme_url: None,
    os: None,
    arch: None,
  )
  |> models.encode_plugin
  |> json.to_string
  |> should.equal(
    "{\"name\":\"hello\",\"description\":\"Build pipeline\",\"version\":\"1.0.0\",\"publishedAt\":\"2026-11-05T00:00:00Z\",\"author\":\"did:plc:abcdefghijklmnopqrstuvwx\",\"license\":\"MIT\",\"url\":\"https://plugins.example/hello.wasm\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000000\",\"size\":8}",
  )
}

pub fn generated_pagination_encoder_handles_arrays_and_cursor_test() {
  models.RegistryListPackagesOutput([], Some("next-page"))
  |> models.encode_registry_list_packages_output
  |> json.to_string
  |> should.equal("{\"packages\":[],\"cursor\":\"next-page\"}")
}

pub fn generated_actor_parameters_require_actor_test() {
  models.RegistryGetActorPackagesParameters(
    actor: "alice.example",
    sort: None,
    q: None,
    latest: None,
    limit: Some(10),
    cursor: None,
  )
  |> models.encode_registry_get_actor_packages_parameters
  |> json.to_string
  |> should.equal("{\"actor\":\"alice.example\",\"limit\":10}")
}
