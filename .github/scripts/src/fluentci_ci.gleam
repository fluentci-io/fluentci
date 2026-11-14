//// Internal CI utilities, compiled for BEAM and distributed as one escript.

import ci/artifacts
import ci/bsd
import ci/common as c
import ci/elf
import ci/fixtures
import ci/graph
import ci/native
import ci/setup
import gleam/result

pub fn dispatch(args: List(String)) -> Result(Nil, String) {
  case args {
    ["test"] ->
      c.stream(
        "gleam",
        ["test", "--target", "erlang"],
        native.cwd() <> "/.github/scripts",
      )
    ["export-setup-env"] -> setup.export(False)
    ["export-spindle-env"] -> setup.export(True)
    ["create-bsd-smoke-fixtures", directory] -> fixtures.create(directory)
    ["check-openbsd-msrv"] -> graph.check()
    ["verify-musl-binary", path, target] -> {
      use data <- result.try(native.read(path))
      elf.musl(data, target)
    }
    ["verify-bsd-release", directory, tag, target] ->
      artifacts.verify_bsd(directory, tag, target)
    ["prepare-bsd-release"] -> bsd.prepare()
    ["build-bsd-release"] -> bsd.build()
    ["bsd-rust-cache"] -> bsd.cache()
    ["smoke-bsd-release", binary, fixtures] -> bsd.smoke(binary, fixtures)
    ["registry-artifact", reference] -> {
      let directory = case native.env("RUNNER_TEMP") {
        "" -> "/tmp/fluentci-registry"
        value -> value <> "/fluentci-registry"
      }
      use path <- result.try(artifacts.resolve(reference, directory))
      let _ = native.stdout(path <> "\n")
      Ok(Nil)
    }
    _ ->
      Error(
        "Usage: fluentci_ci COMMAND [arguments]; see .github/scripts/README.md",
      )
  }
}

pub fn main() {
  case dispatch(native.arguments()) {
    Ok(_) -> Nil
    Error(message) -> {
      let _ = native.stderr("CI helper failed: " <> message <> "\n")
      native.halt(1)
    }
  }
}
