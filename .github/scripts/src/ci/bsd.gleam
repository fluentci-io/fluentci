import ci/common as c
import ci/native
import gleam/bit_array
import gleam/list
import gleam/result
import gleam/string

pub fn prepare() -> Result(Nil, String) {
  let commands = case native.platform() {
    "freebsd" ->
      Ok([
        #("pkg", [
          "install",
          "-y",
          "bash",
          "git",
          "pkgconf",
          "curl",
          "cmake",
          "gmake",
          "perl5",
        ]),
      ])
    "netbsd" ->
      Ok([
        #("/usr/pkg/bin/pkgin", ["-y", "update"]),
        #("/usr/pkg/bin/pkgin", [
          "-y",
          "install",
          "bash",
          "git",
          "pkgconf",
          "curl",
          "xz",
          "cmake",
          "gmake",
          "perl",
        ]),
      ])
    "openbsd" ->
      Ok([
        #("pkg_add", ["-I", "bash", "rust", "git", "curl", "cmake", "gmake"]),
        #("pkg-config", ["--version"]),
      ])
    _ -> Error("BSD preparation requires a native BSD guest")
  }
  use commands <- result.try(commands)
  c.all(commands, fn(command) { c.stream(command.0, command.1, native.cwd()) })
}

pub fn cache() -> Result(Nil, String) {
  let root = native.cwd() <> "/.ci-cache/bsd-rust"
  let _ = native.set_env("CARGO_HOME", root <> "/cargo")
  let _ = native.set_env("CARGO_TARGET_DIR", root <> "/target")
  let _ = native.set_env("CARGO_INCREMENTAL", "0")
  let _ = native.set_env("CARGO_BUILD_JOBS", "2")
  list.each(
    [
      "RUSTC_WRAPPER",
      "RUSTC_WORKSPACE_WRAPPER",
      "SCCACHE_DIR",
      "SCCACHE_CACHE_SIZE",
      "SCCACHE_GHA_ENABLED",
    ],
    native.unset_env,
  )
  c.all([root <> "/cargo", root <> "/target"], native.mkdir)
}

fn download(curl: String, url: String, path: String) -> Result(Nil, String) {
  c.stream(
    curl,
    [
      "--fail",
      "--location",
      "--proto",
      "=https",
      "--proto-redir",
      "=https",
      "--retry",
      "3",
      "--max-time",
      "600",
      "--output",
      path,
      url,
    ],
    native.cwd(),
  )
}

fn rust_version(binary: String) -> Result(String, String) {
  use output <- result.try(c.run(binary, ["--version"], native.cwd()))
  string.trim(output)
  |> string.split(" ")
  |> list.drop(1)
  |> list.first
  |> result.map_error(fn(_) { "Invalid Rust version output" })
}

fn official_rust(
  curl: String,
  selected: String,
  target: String,
) -> Result(Nil, String) {
  use _ <- result.try(c.tag(selected))
  let base = native.cwd() <> "/.ci-cache/bsd-rust"
  let prefix = base <> "/toolchains/" <> selected <> "-" <> target
  let current = case native.regular(prefix <> "/bin/rustc") {
    True -> rust_version(prefix <> "/bin/rustc")
    False -> Error("No cached compiler")
  }
  use _ <- result.try(case current {
    Ok(version) if version == selected -> Ok(Nil)
    _ -> {
      let downloads = base <> "/downloads"
      use _ <- result.try(native.mkdir(downloads))
      let name = "rust-" <> selected <> "-" <> target
      let archive = downloads <> "/" <> name <> ".tar.xz"
      let url = "https://static.rust-lang.org/dist/" <> name <> ".tar.xz"
      use _ <- result.try(download(curl, url <> ".sha256", archive <> ".sha256"))
      use sidecar <- result.try(c.text(archive <> ".sha256"))
      let expected =
        string.trim(sidecar)
        |> string.split(" ")
        |> list.first
        |> result.unwrap("")
      use _ <- result.try(c.require(
        string.length(expected) == 64 && c.ascii(expected, "0123456789abcdef"),
        "Invalid Rust SHA-256",
      ))
      let cached = c.file_hash(archive)
      use _ <- result.try(case cached {
        Ok(actual) if actual == expected -> Ok(Nil)
        _ -> {
          let temporary = archive <> ".part"
          use _ <- result.try(download(curl, url, temporary))
          use actual <- result.try(c.file_hash(temporary))
          use _ <- result.try(c.require(
            actual == expected,
            "Rust archive SHA-256 mismatch",
          ))
          native.rename(temporary, archive)
        }
      })
      c.with_temp("fluentci-rust-", fn(extracted) {
        use _ <- result.try(c.stream(
          "xz",
          ["--decompress", "--keep", "--force", "--", archive],
          native.cwd(),
        ))
        let tar = string.drop_end(archive, 3)
        let unpack =
          c.stream("tar", ["-xf", tar, "-C", extracted], native.cwd())
        let cleanup = native.remove(tar)
        use _ <- result.try(unpack)
        use _ <- result.try(cleanup)
        c.stream(
          extracted <> "/" <> name <> "/install.sh",
          [
            "--prefix=" <> prefix,
            "--components=rustc,cargo,rust-std-" <> target,
            "--disable-ldconfig",
          ],
          native.cwd(),
        )
      })
    }
  })
  let _ = native.set_env("PATH", prefix <> "/bin:" <> native.env("PATH"))
  Ok(Nil)
}

pub fn smoke(binary: String, fixtures: String) -> Result(Nil, String) {
  let binary = native.absolute(binary)
  let fixtures = native.absolute(fixtures)
  let _ = native.unset_env("FLUENTCI_PROJECT_ID")
  let _ = native.set_env("FLUENTCI_BSD_SMOKE", "bsd-release-smoke")
  c.with_temp("fluentci-bsd-smoke-", fn(workspace) {
    let base = ["--check-update=false", "--database", workspace <> "/state.db"]
    use output <- result.try(c.run(
      binary,
      list.append(base, [
        "run",
        "--wasm",
        fixtures <> "/host_import.wasm",
        "env_roundtrip",
      ]),
      workspace,
    ))
    use _ <- result.try(c.require(
      string.trim(output) == "bsd-release-smoke",
      "Wasm host import roundtrip failed",
    ))
    use _ <- result.try(
      c.all(
        [
          #("unreachable", "wasm `unreachable` instruction executed"),
          #("memory_oob", "out of bounds memory access"),
        ],
        fn(trap) {
          let #(status, output) =
            native.execute(
              binary,
              list.append(base, [
                "run",
                "--wasm",
                fixtures <> "/" <> trap.0 <> ".wasm",
                trap.0,
              ]),
              workspace,
              False,
              True,
            )
          use _ <- result.try(c.write(
            fixtures <> "/" <> trap.0 <> ".log",
            output,
          ))
          c.require(
            status != 0 && string.contains(output, trap.1),
            "Missing Wasm trap diagnostics: " <> trap.0,
          )
        },
      ),
    )
    use _ <- result.try(c.write(
      workspace <> "/fluentci.toml",
      "[[steps]]\nname = \"smoke\"\ncommand = \"printf bsd-release-smoke > artifact\"\n",
    ))
    use _ <- result.try(c.run(binary, list.append(base, ["run"]), workspace))
    use artifact <- result.try(c.text(workspace <> "/artifact"))
    use _ <- result.try(c.require(
      artifact == "bsd-release-smoke",
      "Native pipeline artifact mismatch",
    ))
    use _ <- result.try(c.run(
      binary,
      list.append(base, ["project", "create"]),
      workspace,
    ))
    use projects <- result.try(c.run(
      binary,
      list.append(base, ["project", "list"]),
      workspace,
    ))
    c.require(
      string.contains(projects, "project-"),
      "SQLite project persistence smoke failed",
    )
  })
}

fn package(
  binary: String,
  output: String,
  tag: String,
  target: String,
  runtime: String,
) -> Result(Nil, String) {
  use revision <- result.try(c.run("git", ["rev-parse", "HEAD"], native.cwd()))
  use version <- result.try(c.run(binary, ["--version"], native.cwd()))
  use os <- result.try(c.run("uname", ["-a"], native.cwd()))
  use rust <- result.try(c.run("rustc", ["-vV"], native.cwd()))
  use cargo <- result.try(c.run("cargo", ["--version"], native.cwd()))
  use pax <- result.try(case native.platform() {
    "netbsd" -> c.run("/usr/sbin/paxctl", [binary], native.cwd())
    _ -> Ok("")
  })
  use links <- result.try(c.run("ldd", [binary], native.cwd()))
  use _ <- result.try(c.require(
    !string.contains(string.lowercase(links), "not found"),
    "Unresolved dynamic dependency",
  ))
  let info =
    "Target: "
    <> target
    <> "\nRelease tag: "
    <> tag
    <> "\nSource revision: "
    <> string.trim(revision)
    <> "\n"
    <> version
    <> "Runtime: "
    <> runtime
    <> "\n"
    <> os
    <> rust
    <> cargo
    <> "\nNetBSD executable PaX policy:\n"
    <> pax
    <> "\nDynamic dependencies:\n"
    <> links
  use binary_bits <- result.try(native.read(binary))
  use regular <- result.try(
    list.try_fold(
      [
        #("LICENSE", "LICENSE"),
        #("README.md", ".github/BSD-RELEASES.md"),
        #("licenses/wasmtime/LICENSE", "engine/vendor/wasmtime/LICENSE"),
        #(
          "licenses/extism-openbsd/LICENSE",
          "engine/vendor/extism-openbsd/LICENSE",
        ),
        #(
          "licenses/superconsole/LICENSE-MIT",
          "engine/vendor/superconsole/LICENSE-MIT",
        ),
        #(
          "licenses/superconsole/LICENSE-APACHE",
          "engine/vendor/superconsole/LICENSE-APACHE",
        ),
      ],
      [],
      fn(acc, item) {
        use bits <- result.try(native.read(item.1))
        Ok([#(item.0, bits, 420), ..acc])
      },
    ),
  )
  let name = "fluentci_" <> tag <> "_" <> target <> ".tar.gz"
  let path = output <> "/" <> name
  use _ <- result.try(
    native.create_archive(path, [
      #("fluentci", binary_bits, 493),
      #("BUILD-INFO.txt", bit_array.from_string(info), 420),
      ..regular
    ]),
  )
  use _ <- result.try(c.checksum(path, name))
  c.write(output <> "/status", "built\n")
}

pub fn build() -> Result(Nil, String) {
  use tag <- result.try(c.env("RELEASE_VERSION"))
  use target <- result.try(c.env("TARGET"))
  use selected <- result.try(c.env("BSD_RUST_VERSION"))
  use _ <- result.try(c.tag(tag))
  use curl <- result.try(case #(native.platform(), target) {
    #("freebsd", "x86_64-unknown-freebsd") -> Ok("/usr/local/bin/curl")
    #("netbsd", "x86_64-unknown-netbsd") -> Ok("/usr/pkg/bin/curl")
    #("openbsd", "x86_64-unknown-openbsd") -> Ok("/usr/local/bin/curl")
    _ -> Error("Release target does not match native guest")
  })
  let root = native.cwd()
  let _ =
    native.set_env(
      "PATH",
      "/usr/local/bin:/usr/local/sbin:/usr/pkg/bin:/usr/pkg/sbin:"
        <> native.env("PATH"),
    )
  let output = root <> "/dist/bsd/" <> target
  use _ <- result.try(native.mkdir(output))
  use _ <- result.try(c.all(
    [output <> "/status", output <> "/SKIPPED.txt"],
    native.remove,
  ))
  use _ <- result.try(cache())
  use _ <- result.try(c.require(
    native.regular(root <> "/webui/dist/index.html")
      && native.size(root <> "/webui/dist/index.html") > 0,
    "Missing prepared Studio assets",
  ))
  use _ <- result.try(case native.platform() {
    "openbsd" -> Ok(Nil)
    _ -> official_rust(curl, selected, target)
  })
  use actual <- result.try(rust_version("rustc"))
  use _ <- result.try(c.require(
    native.platform() == "openbsd" || actual == selected,
    "Wrong Rust compiler version",
  ))
  use verbose <- result.try(c.run("rustc", ["-vV"], root))
  use _ <- result.try(c.require(
    string.contains(verbose, "host: " <> target <> "\n"),
    "Rust compiler host mismatch",
  ))
  use _ <- result.try(c.stream(
    "git",
    ["config", "--global", "--add", "safe.directory", root],
    root,
  ))
  use _ <- result.try(c.stream(
    "cargo",
    ["build", "--release", "--locked", "-p", "fluentci"],
    root,
  ))
  let binary = native.env("CARGO_TARGET_DIR") <> "/release/fluentci"
  use _ <- result.try(c.stream("strip", ["-s", binary], root))
  use _ <- result.try(case native.platform() {
    "netbsd" -> c.stream("/usr/sbin/paxctl", ["-M", "+m", binary], root)
    _ -> Ok(Nil)
  })
  use _ <- result.try(c.stream(binary, ["--version"], root))
  use _ <- result.try(c.stream(binary, ["--help"], root))
  use _ <- result.try(smoke(binary, root <> "/.release-smoke"))
  let runtime = case native.platform() {
    "openbsd" -> "Extism 1.21.1 / Wasmtime 41.0.4 (OpenBSD compatibility)"
    _ -> "Extism 1.41.0 / Wasmtime 49.0.5 (NetBSD signal backport)"
  }
  package(binary, output, tag, target, runtime)
}
