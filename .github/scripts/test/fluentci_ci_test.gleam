import ci/artifacts
import ci/common as c
import ci/elf
import ci/fixtures
import ci/graph
import ci/native
import ci/setup
import gleam/bit_array
import gleam/list
import gleam/result
import gleam/string
import gleeunit
import gleeunit/should

pub fn main() {
  gleeunit.main()
}

fn zeros(size: Int) {
  c.indices(size) |> list.map(fn(_) { <<0>> }) |> bit_array.concat
}

fn binary(machine: Int, kind: Int, tag: Int) {
  <<
    127,
    69,
    76,
    70,
    2,
    1,
    zeros(12):bits,
    machine:16-little,
    zeros(12):bits,
    64:64-little,
    zeros(14):bits,
    56:16-little,
    1:16-little,
    zeros(6):bits,
    kind:32-little,
    zeros(4):bits,
    120:64-little,
    zeros(16):bits,
    16:64-little,
    zeros(16):bits,
    tag:64-little,
    zeros(8):bits,
  >>
}

pub fn static_musl_and_pie_for_both_architectures_test() {
  list.each([#(62, "x86_64"), #(183, "aarch64")], fn(arch) {
    list.each([1, 2], fn(kind) {
      elf.musl(binary(arch.0, kind, 0), arch.1 <> "-unknown-linux-musl")
      |> should.equal(Ok(Nil))
    })
  })
}

pub fn reject_dynamic_interpreter_shared_library_wrong_arch_and_truncation_test() {
  list.each(
    [binary(62, 3, 0), binary(62, 2, 1), binary(183, 1, 0), <<0>>],
    fn(bits) {
      elf.musl(bits, "x86_64-unknown-linux-musl")
      |> result.is_error
      |> should.be_true
    },
  )
}

pub fn official_pinned_references_and_registry_identity_test() {
  artifacts.reference("@fluentci.io/setup-node@v0.2.0")
  |> should.equal(Ok(#("setup-node", "0.2.0")))
  list.each(
    [
      "setup-node@latest",
      "../escape@1.0.0",
      "@other/setup-node@0.2.0",
      "setup-node@01.2.0",
      "setup-node@1.2",
      "setup-node@1.2.3-",
    ],
    fn(ref) { artifacts.reference(ref) |> result.is_error |> should.be_true },
  )
  let bits = <<0, 97, 115, 109, 13, 0, 1, 0>>
  let package =
    artifacts.Package(
      "setup-node",
      "0.2.0",
      native.sha256(bits),
      8,
      "https://example.com/setup-node.wasm",
    )
  artifacts.validate_package(package, "setup-node", "0.2.0")
  |> should.equal(Ok(Nil))
  artifacts.wasm_matches(bits, package) |> should.be_true
  artifacts.wasm_matches(<<0, 97, 115, 109, 1, 0, 0, 0>>, package)
  |> should.be_false
  artifacts.validate_package(package, "other", "0.2.0")
  |> result.is_error
  |> should.be_true
  artifacts.validate_package(
    artifacts.Package(..package, url: "http://example.com/setup-node.wasm"),
    "setup-node",
    "0.2.0",
  )
  |> result.is_error
  |> should.be_true
  artifacts.validate_package(
    artifacts.Package(..package, size: 67_108_865),
    "setup-node",
    "0.2.0",
  )
  |> result.is_error
  |> should.be_true
}

pub fn typed_setup_and_environment_validation_test() {
  let variables = [
    setup.Variable("CARGO_HOME", "/tools/rust/cargo"),
    setup.Variable("PATH", "/tools/rust/bin:/tools/node/bin:/usr/bin"),
  ]
  setup.validate(setup.Setup("/tools/rust/bin", variables), "/usr/bin")
  |> should.equal(
    Ok(
      #(["/tools/rust/bin", "/tools/node/bin"], [
        setup.Variable("CARGO_HOME", "/tools/rust/cargo"),
      ]),
    ),
  )
  list.each(
    [
      setup.Setup("relative", []),
      setup.Setup("/bin\nevil", []),
      setup.Setup("/bin", [setup.Variable("BAD-NAME", "x")]),
      setup.Setup("/bin", [setup.Variable("GITHUB_TOKEN", "x")]),
      setup.Setup("/bin", [setup.Variable("NODE_OPTIONS", "--import evil")]),
      setup.Setup("/bin", [setup.Variable("A", "x"), setup.Variable("A", "y")]),
      setup.Setup("/bin", [setup.Variable("PATH", "relative:/bin")]),
    ],
    fn(value) { setup.validate(value, "") |> result.is_error |> should.be_true },
  )
  setup.parse("{\"bin-dir\":\"/tools/bin\",\"environment\":[]}")
  |> should.equal(Ok(setup.Setup("/tools/bin", [])))
  setup.parse("{\"environment\":{}}") |> result.is_error |> should.be_true
}

pub fn github_paths_multiline_values_and_validation_before_writes_test() {
  let prior_path = native.env("GITHUB_PATH")
  let prior_env = native.env("GITHUB_ENV")
  let assert Ok(Nil) =
    c.with_temp("fluentci-env-test-", fn(directory) {
      let paths = directory <> "/paths"
      let env = directory <> "/env"
      let _ = native.set_env("GITHUB_PATH", paths)
      let _ = native.set_env("GITHUB_ENV", env)
      setup.github(setup.Setup("relative", []))
      |> result.is_error
      |> should.be_true
      native.regular(paths) |> should.be_false
      native.regular(env) |> should.be_false
      use _ <- result.try(
        setup.github(
          setup.Setup("/tools/rust/bin", [
            setup.Variable("PATH", "/tools/rust/bin:/tools/node/bin"),
            setup.Variable("MULTILINE", "first\nEOF\nlast"),
          ]),
        ),
      )
      c.text(paths) |> should.equal(Ok("/tools/node/bin\n/tools/rust/bin\n"))
      use exported <- result.try(c.text(env))
      string.contains(exported, "first\nEOF\nlast\nfluentci_") |> should.be_true
      string.contains(exported, "PATH<<") |> should.be_false
      Ok(Nil)
    })
  let _ = native.set_env("GITHUB_PATH", prior_path)
  let _ = native.set_env("GITHUB_ENV", prior_env)
  Nil
}

pub fn leb_and_wasm_fixture_encoding_test() {
  fixtures.unsigned(128) |> should.equal(<<128, 1>>)
  fixtures.unsigned(16_384) |> should.equal(<<128, 128, 1>>)
  fixtures.signed(70) |> should.equal(<<198, 0>>)
  fixtures.signed(-1) |> should.equal(<<127>>)
  fixtures.trap("unreachable", False, <<0>>)
  |> bit_array.slice(0, 8)
  |> should.equal(Ok(<<0, 97, 115, 109, 1, 0, 0, 0>>))
}

pub fn dependency_graph_checks_only_reachable_msrv_and_exact_runtime_pair_test() {
  graph.supported_version("1.90") |> should.be_true
  graph.supported_version("1.90.0") |> should.be_true
  graph.supported_version("1.90.1") |> should.be_false
  graph.supported_version("1.91") |> should.be_false
  let packages = [
    graph.Package("root", "fluentci", "0.17.4", "1.90"),
    graph.Package("runtime", "fluentci-extism-openbsd", "1.21.1", "1.90"),
    graph.Package("wasmtime", "wasmtime", "41.0.4", "1.90"),
    graph.Package("unused", "unused", "1.0.0", "1.100"),
  ]
  let nodes = [
    graph.Node("root", ["runtime", "wasmtime"]),
    graph.Node("runtime", []),
    graph.Node("wasmtime", []),
  ]
  graph.validate(packages, nodes) |> should.equal(Ok(Nil))
  graph.validate(packages, [graph.Node("root", ["missing"])])
  |> result.is_error
  |> should.be_true
}

fn archive_entries(target: String) {
  [
    #("fluentci", binary(62, 1, 0), 493),
    #(
      "BUILD-INFO.txt",
      bit_array.from_string(
        "Target: " <> target <> "\nRelease tag: v0.0.0-test\n",
      ),
      420,
    ),
    #("LICENSE", <<1>>, 420),
    #("README.md", <<1>>, 420),
    #("licenses/wasmtime/LICENSE", <<1>>, 420),
    #("licenses/extism-openbsd/LICENSE", <<1>>, 420),
    #("licenses/superconsole/LICENSE-MIT", <<1>>, 420),
    #("licenses/superconsole/LICENSE-APACHE", <<1>>, 420),
  ]
}

pub fn bsd_archive_checksum_metadata_permissions_and_member_safety_test() {
  let assert Ok(Nil) =
    c.with_temp("fluentci-archive-test-", fn(directory) {
      let target = "x86_64-unknown-netbsd"
      let name = "fluentci_v0.0.0-test_" <> target <> ".tar.gz"
      let archive = directory <> "/" <> name
      use _ <- result.try(c.write(directory <> "/status", "built\n"))
      use _ <- result.try(native.create_archive(
        archive,
        archive_entries(target),
      ))
      use _ <- result.try(c.checksum(archive, name))
      artifacts.verify_bsd(directory, "v0.0.0-test", target)
      |> should.equal(Ok(Nil))
      use _ <- result.try(
        native.create_archive(archive, [
          #("../escape", <<1>>, 420),
          ..archive_entries(target)
        ]),
      )
      use _ <- result.try(c.checksum(archive, name))
      artifacts.verify_bsd(directory, "v0.0.0-test", target)
      |> result.is_error
      |> should.be_true
      use _ <- result.try(native.create_archive(
        archive,
        archive_entries("x86_64-unknown-freebsd"),
      ))
      use _ <- result.try(c.checksum(archive, name))
      artifacts.verify_bsd(directory, "v0.0.0-test", target)
      |> result.is_error
      |> should.be_true
      use _ <- result.try(c.write(archive <> ".sha256", "corrupt"))
      artifacts.verify_bsd(directory, "v0.0.0-test", target)
      |> result.is_error
      |> should.be_true
      Ok(Nil)
    })
  artifacts.safe_member("fluentci", "symlink") |> should.be_false
  artifacts.safe_member("/absolute", "regular") |> should.be_false
  artifacts.safe_member("dir/../escape", "regular") |> should.be_false
}

pub fn native_commands_preserve_literal_arguments_and_failures_test() {
  c.run("printf", ["%s", "a path $(literal) ' quoted"], native.cwd())
  |> should.equal(Ok("a path $(literal) ' quoted"))
  c.run("false", [], native.cwd()) |> result.is_error |> should.be_true
}

pub fn spindle_persists_tool_variables_and_rejects_reserved_updates_test() {
  let assert Ok(Nil) =
    c.with_temp("fluentci-spindle-test-", fn(state) {
      use _ <- result.try(setup.spindle_to(
        setup.Setup("/tools/rust/bin", [
          setup.Variable("CARGO_HOME", "/tools/rust/cargo"),
        ]),
        state,
        "/usr/bin:/bin",
      ))
      use _ <- result.try(setup.spindle_to(
        setup.Setup("/tools/node/bin", [
          setup.Variable("JAVA_HOME", "/tools/java"),
          setup.Variable("LITERAL", "$(touch never) ' quoted"),
        ]),
        state,
        "/tools/rust/bin:/usr/bin:/bin",
      ))
      use manifest <- result.try(c.text(state <> "/environment.json"))
      string.contains(manifest, "CARGO_HOME") |> should.be_true
      string.contains(manifest, "JAVA_HOME") |> should.be_true
      use shell <- result.try(c.text(state <> "/environment.sh"))
      string.contains(shell, "export LITERAL='$(touch never)") |> should.be_true
      setup.spindle_to(
        setup.Setup("/tools/bin", [setup.Variable("SPINDLE_TOKEN", "fixture")]),
        state,
        "/usr/bin",
      )
      |> result.is_error
      |> should.be_true
      c.text(state <> "/environment.json") |> should.equal(Ok(manifest))
      Ok(Nil)
    })
}
