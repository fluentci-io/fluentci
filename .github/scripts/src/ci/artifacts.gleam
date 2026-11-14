import ci/common as c
import ci/elf
import ci/native
import gleam/bit_array
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import gleam/uri

pub fn safe_member(name: String, kind: String) -> Bool {
  name != ""
  && !string.starts_with(name, "/")
  && !list.contains(string.split(name, "/"), "..")
  && c.clean(name)
  && list.contains(["regular", "directory"], kind)
}

fn without_slash(value: String) -> String {
  case string.ends_with(value, "/") {
    True -> without_slash(string.drop_end(value, 1))
    False -> value
  }
}

pub fn verify_bsd(
  directory: String,
  tag: String,
  target: String,
) -> Result(Nil, String) {
  use _ <- result.try(c.tag(tag))
  use _ <- result.try(c.require(
    list.contains(
      [
        "x86_64-unknown-freebsd",
        "x86_64-unknown-netbsd",
        "x86_64-unknown-openbsd",
      ],
      target,
    ),
    "Unsupported BSD target",
  ))
  use _ <- result.try(c.require(
    native.regular(directory <> "/status"),
    "Missing BSD build status: "
      <> directory
      <> "/status; check guest build execution and artifact copyback",
  ))
  use status <- result.try(c.text(directory <> "/status"))
  use _ <- result.try(c.require(
    string.trim(status) == "built",
    "Release was not marked built",
  ))
  let name = "fluentci_" <> tag <> "_" <> target <> ".tar.gz"
  let archive = directory <> "/" <> name
  use _ <- result.try(c.require(
    native.regular(archive),
    "Missing BSD release archive: " <> archive,
  ))
  use digest <- result.try(c.file_hash(archive))
  use sidecar <- result.try(c.text(archive <> ".sha256"))
  use _ <- result.try(c.require(
    sidecar == digest <> "  " <> name <> "\n",
    "Archive SHA-256 mismatch",
  ))
  use entries <- result.try(native.archive_entries(archive))
  let names = list.map(entries, fn(entry) { without_slash(entry.0) })
  use _ <- result.try(c.require(
    list.length(names) == list.length(list.unique(names)),
    "Duplicate archive entries",
  ))
  use _ <- result.try(
    c.all(entries, fn(entry) {
      c.require(safe_member(entry.0, entry.1), "Unsafe archive entry")
    }),
  )
  use binary_entry <- result.try(
    list.find(entries, fn(entry) { entry.0 == "fluentci" })
    |> result.map_error(fn(_) { "Missing executable" }),
  )
  use _ <- result.try(c.require(
    binary_entry.1 == "regular"
      && binary_entry.2 >= 64
      && int.bitwise_and(binary_entry.3, 73) != 0,
    "Missing executable permissions",
  ))
  use binary <- result.try(native.archive_member(archive, "fluentci"))
  use _ <- result.try(elf.header(binary, 62))
  use info_bits <- result.try(native.archive_member(archive, "BUILD-INFO.txt"))
  use info <- result.try(
    bit_array.to_string(info_bits)
    |> result.map_error(fn(_) { "Invalid build metadata" }),
  )
  use _ <- result.try(c.require(
    string.contains(info, "Target: " <> target <> "\n")
      && string.contains(info, "Release tag: " <> tag <> "\n"),
    "Build metadata does not match artifact",
  ))
  c.all(
    [
      "LICENSE",
      "README.md",
      "licenses/wasmtime/LICENSE",
      "licenses/extism-openbsd/LICENSE",
      "licenses/superconsole/LICENSE-MIT",
      "licenses/superconsole/LICENSE-APACHE",
    ],
    fn(required) {
      c.require(
        list.any(entries, fn(entry) {
          entry.0 == required && entry.1 == "regular"
        }),
        "Missing release file: " <> required,
      )
    },
  )
}

pub fn reference(value: String) -> Result(#(String, String), String) {
  let value = case string.starts_with(value, "@fluentci.io/") {
    True -> string.drop_start(value, 13)
    False -> value
  }
  case string.split(value, "@") {
    [name, raw_version] -> {
      let version = case string.starts_with(raw_version, "v") {
        True -> string.drop_start(raw_version, 1)
        False -> raw_version
      }
      use _ <- result.try(c.require(
        c.ascii(name, "abcdefghijklmnopqrstuvwxyz0123456789-")
          && c.ascii(string.slice(name, 0, 1), "abcdefghijklmnopqrstuvwxyz")
          && string.length(name) <= 64,
        "Invalid official package name",
      ))
      let core = version |> string.split("-") |> list.first |> result.unwrap("")
      use _ <- result.try(c.require(
        c.ascii(
          version,
          "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-",
        )
          && list.length(string.split(core, ".")) == 3,
        "Use an exact official package version",
      ))
      use _ <- result.try(c.require(
        version == core || string.length(version) > string.length(core) + 1,
        "Invalid semantic prerelease",
      ))
      use _ <- result.try(
        c.all(string.split(core, "."), fn(component) {
          case int.parse(component) {
            Ok(n) ->
              c.require(
                n >= 0 && int.to_string(n) == component,
                "Invalid semantic version",
              )
            Error(_) -> Error("Invalid semantic version")
          }
        }),
      )
      Ok(#(name, version))
    }
    _ ->
      Error(
        "Use an exact official package reference, for example setup-node@0.2.0",
      )
  }
}

pub type Package {
  Package(name: String, version: String, digest: String, size: Int, url: String)
}

fn package_decoder() {
  use name <- decode.field("name", decode.string)
  use version <- decode.field("version", decode.string)
  use digest <- decode.field("sha256", decode.string)
  use size <- decode.field("size", decode.int)
  use url <- decode.field("url", decode.string)
  decode.success(Package(name, version, digest, size, url))
}

pub fn validate_package(
  package: Package,
  name: String,
  version: String,
) -> Result(Nil, String) {
  use _ <- result.try(c.require(
    package.name == name && package.version == version,
    "Registry returned a different package/version",
  ))
  use _ <- result.try(c.require(
    string.length(package.digest) == 64
      && c.ascii(package.digest, "0123456789abcdef")
      && package.size >= 8
      && package.size <= 67_108_864,
    "Invalid Wasm checksum or size",
  ))
  use url <- result.try(
    uri.parse(package.url) |> result.map_error(fn(_) { "Invalid artifact URL" }),
  )
  c.require(
    url.scheme == Some("https")
      && url.userinfo == None
      && url.host != None
      && url.host != Some("")
      && string.ends_with(url.path, ".wasm"),
    "Invalid HTTPS Wasm URL",
  )
}

pub fn wasm_matches(data: BitArray, package: Package) -> Bool {
  let magic = case data {
    <<0, 97, 115, 109, 1, 0, 0, 0, _:bits>>
    | <<0, 97, 115, 109, 13, 0, 1, 0, _:bits>> -> True
    _ -> False
  }
  magic
  && bit_array.byte_size(data) == package.size
  && native.sha256(data) == package.digest
}

fn cached(path: String, package: Package) -> Bool {
  case native.regular(path) && native.size(path) == package.size {
    False -> False
    True ->
      case native.read(path) {
        Ok(data) -> wasm_matches(data, package)
        Error(_) -> False
      }
  }
}

pub fn resolve(value: String, directory: String) -> Result(String, String) {
  use ref <- result.try(reference(value))
  let endpoint =
    "https://api.fluentci.io/xrpc/io.fluentci.registry.getPackage?author=fluentci.io&name="
    <> ref.0
    <> "&version="
    <> ref.1
  use metadata <- result.try(c.run(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "--retry",
      "3",
      "--max-time",
      "30",
      "--max-filesize",
      "2097152",
      "--user-agent",
      "fluentci-ci-bootstrap/1.0",
      endpoint,
    ],
    native.cwd(),
  ))
  use package <- result.try(
    json.parse(
      metadata,
      decode.field("package", package_decoder(), decode.success),
    )
    |> result.map_error(fn(_) { "Invalid registry metadata" }),
  )
  use _ <- result.try(validate_package(package, ref.0, ref.1))
  use _ <- result.try(native.mkdir(directory))
  let path = directory <> "/" <> package.digest <> ".wasm"
  case cached(path, package) {
    True -> Ok(path)
    False -> {
      let temporary = path <> "." <> native.nonce()
      let download = {
        use _ <- result.try(c.stream(
          "curl",
          [
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--retry",
            "3",
            "--max-time",
            "90",
            "--max-filesize",
            int.to_string(package.size),
            "--header",
            "Accept-Encoding: identity",
            "--user-agent",
            "fluentci-ci-bootstrap/1.0",
            "--output",
            temporary,
            package.url,
          ],
          native.cwd(),
        ))
        use _ <- result.try(c.require(
          cached(temporary, package),
          "Wasm checksum, size or header mismatch",
        ))
        native.rename(temporary, path)
      }
      let cleanup = native.remove(temporary)
      use _ <- result.try(download)
      use _ <- result.try(cleanup)
      Ok(path)
    }
  }
}
