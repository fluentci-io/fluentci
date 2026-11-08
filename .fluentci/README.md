# FluentCI's own CI

The nine repository modules are **PureScript Wasm components**. FluentCI 0.17.2
or newer detects their runtime automatically. The root `fluentci.toml` declares
`runtime = "component"` for every module; `common` is a shared source package.

```sh
fluentci modules
fluentci run                         # main.check
fluentci run rust check
fluentci run studio build
fluentci run release --help
fluentci run desktop package --help
```

## Typed function arguments

Exported PureScript functions accept concrete records. Compiler inspection
regenerates WIT, argument descriptions, and return types on every build:

```purescript
-- | Sign and create verified Studio DMG and ZIP installers.
-- | @param target Rust target triple for the build or release.
-- | @param version Release tag, for example v0.17.2.
package :: { target :: String, version :: String } -> Effect Unit
```

Call functions with named flags, without a serialized JSON payload:

```sh
fluentci run desktop build --target aarch64-apple-darwin
fluentci run desktop package --target aarch64-apple-darwin --version v0.17.2
fluentci run release build-prepared --target x86_64-unknown-linux-gnu
fluentci run release package --target x86_64-unknown-linux-gnu --version v0.17.2
fluentci run cachix setup --cache fluentci
fluentci run nix-build build --cache fluentci
```

Arguments are WIT strings with source descriptions. These jobs perform effects
and have an explicit WIT unit return type (`Effect Unit` in PureScript). Functions
without inputs take no flags. WIT uses kebab-case names: `build-prepared`,
`linux-dependencies`, `reserve-bsd-disk`, `bsd-build`, `bsd-verify`, `bsd-upload`.
Invalid or missing arguments fail before invoking the job. Runtime configuration
such as target, version, and cache is explicit; tokens stay in the environment.

| Module      | Functions                                                                                                                                             | Purpose                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `main`      | `check`, `build`                                                                                                                                      | Repository checks and release CLI build    |
| `rust`      | `format`, `lint`, `test`, `check`, `build`                                                                                                            | Release Cargo checks; Studio builds first  |
| `studio`    | `install`, `build`                                                                                                                                    | Frozen Bun install and embedded web assets |
| `release`   | `prepare`, `build`, `build-prepared`, `check`, `package`, `upload`, `linux-dependencies`, `reserve-bsd-disk`, `bsd-build`, `bsd-verify`, `bsd-upload` | CLI releases on Linux, macOS and BSD       |
| `desktop`   | `build`, `clean`, `sign`, `package`, `upload`                                                                                                         | macOS Studio releases                      |
| `nix`       | `check`, `metadata`, `flakehub`, `flakestry`                                                                                                          | Nix checks and publication                 |
| `nix-build` | `build`                                                                                                                                               | Nix build with Cachix uploads              |
| `cachix`    | `setup`, `push`                                                                                                                                       | Cache configuration and result uploads     |
| `gemfury`   | `dependencies`, `package`, `upload`, `github`                                                                                                         | Debian/RPM packages and publication        |

## Build and test

Install Node 24+, PureScript 0.15.16 and Spago 1.0.5. GitHub workflows use the
official registry components (`setup-node`, `setup-bun`, `setup-purescript`,
`setup-rust`, `setup-gleam`, `setup-elixir`, `setup-erlang`, `setup-uv`,
`setup-java`, `setup-clojure`, and `setup-pkl`) pinned to `0.2.0`.
The SDK toolchain script remains available for manual development.
ComponentizeJS, jco, esbuild and the inspection
bindings are pinned in each module's npm lockfile. Extism JS and Binaryen are
not needed to compile these modules.

```sh
cd .fluentci/desktop
npm ci --ignore-scripts
npm run build
npm test
```

The common build script compiles PureScript, inspects compiler-generated docs
and CoreFn, generates WIT, and builds `dist/plugin.wasm`. `dist/wit/module.wit`
and `dist/fluentci.metadata.json` are generated, ignored artifacts. The host WIT
is copied from the engine with runtime version **0.1.0**. There is no handwritten
`imports.d.ts` or separate export list. `entry.mjs` selects public functions.
`dist/plugin.cjs` is a test bundle, never the production module runtime.

After compiling every module, check the actual component interfaces:

```sh
node --test .fluentci/tests/components.test.mjs
```

Direct host-bridge tests exercise packaging, signing order, cleanup, Cachix,
and publishing without launching FluentCI or publishing anything. The separate
`.fluentci/tests/modules.test.mjs` integration suite launches the installed CLI
and runs compiled components against mock host tools. It tests named arguments,
release ordering, early failures, checksums, and cache behavior. CI runs both.

## Releases

```sh
fluentci run release prepare --version v0.17.2
fluentci run release build --target aarch64-apple-darwin
fluentci run release package --target aarch64-apple-darwin --version v0.17.2
fluentci run release upload --target aarch64-apple-darwin --version v0.17.2
```

`build` prepares Studio; `build-prepared` uses an existing `webui/dist/index.html`.
Archives contain one executable and a SHA-256 sidecar under `target/release-assets`.
Uploads require an existing GitHub release and `GH_TOKEN`.

GitHub Actions bootstraps FluentCI with `https://cli.fluentci.io` (release jobs
select `FLUENTCI_VERSION`), compiles repository components once on Ubuntu,
and transfers them to native release runners. Runner jobs pass `--target` and
`--version` explicitly. BSD guests need neither Node nor a PureScript compiler;
see [BSD releases](../.github/BSD-RELEASES.md). Every Rust build/test/lint uses
release mode and locked dependencies.

Studio packaging signs and verifies the app before producing a DMG and ZIP.
DMG sizing accounts for logical and allocated bytes, with filesystem headroom;
the image is verified before checksums or uploads. `desktop clean --target …`
removes disposable CI build products while preserving the bundled app and
reusable Cargo dependencies. It skips cleanup outside GitHub Actions.

## Cachix and Nix publishing

The registry module `setup-cachix@v0.2.1` installs Cachix and enables the public
`fluentci` cache with `--cache fluentci`. Its typed environment result is exported
to subsequent workflow steps. `CACHIX_AUTH_TOKEN` enables uploads; missing or
blank tokens skip uploads while Nix builds still run.
`nix-build build --cache fluentci` uses Cachix `watch-exec`
to upload new build paths, then pushes the final `./result` closure. Failures
propagate. The cache name is a named argument; the token is never a CLI argument.

```sh
fluentci run setup-cachix@v0.2.1 setup --cache fluentci
fluentci run nix-build build --cache fluentci
fluentci run cachix push --cache fluentci
fluentci run nix flakehub --version v0.17.2
fluentci run nix flakestry --version v0.17.2 --ref COMMIT_SHA
```

Nix publishers require their tools and GitHub OIDC variables. FlakeHub also needs
`FLAKEHUB_PUSH_GITHUB_TOKEN`; Flakestry uses `GH_TOKEN`. The publishing workflows
accept an existing tag and call the registry `nix-publish@v0.2.0` component on the
resolved tag revision. `setup-determinate-nix` provisions Nix;
`setup-flakehub-push` provisions FlakeHub publishing, and `setup-bun` supplies
Flakestry’s HTTP/JSON runtime. No publishing Wasm is compiled in these workflows.
Each publication has an explicit fresh `--run-dir`, and FlakeHub receives
`--name "$GITHUB_REPOSITORY"`. Neither publishing function runs in the default check.

## Gemfury

```sh
fluentci run gemfury dependencies --target x86_64-unknown-linux-gnu
fluentci run gemfury package --target x86_64-unknown-linux-gnu --version v0.17.2
fluentci run gemfury upload --target x86_64-unknown-linux-gnu --version v0.17.2 --account fluentci
fluentci run gemfury github --target x86_64-unknown-linux-gnu --version v0.17.2
```

Both `x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu` are supported.
`CI.LinuxPackages` generates Debian/RPM metadata and checksums in PureScript,
using native file primitives and literal `dpkg-deb`/`rpmbuild` argument vectors.
The existing target executable must have been built first. Packages and checksum
sidecars are written to `target/release-assets`; Ubuntu binaries require glibc 2.39.

Pass the destination as `--account`. Actions supplies it from `FURY_ACCOUNT`.
`FURY_USER` and `FURY_TOKEN` remain environment credentials. A missing or blank
token skips Gemfury uploads; authentication and upload errors fail the job.
Curl 8.3+ expands credentials from environment variables, keeping tokens out of
command arguments and pipeline plans. `github` uploads packages through `gh`.

## GitHub Actions environment handoff

Setup components return their installation directory and environment as typed
values. Workflows pipe that result to `.github/scripts/export-setup-env.py`,
which persists PATH additions in `GITHUB_PATH` and variables such as `CARGO_HOME`,
`RUSTUP_HOME`, and `JAVA_HOME` in `GITHUB_ENV`. This is necessary because each
Actions step runs in a separate process. Tool installers run inside Wasm; the
Python helper only exports the returned values and validates their shape.

The setup bridge has standalone tests that do not install tools or invoke the CLI:

```sh
python3 .github/scripts/test-setup-env.py
```

### Bootstrap CLI compatibility

Workflows bootstrap FluentCI v0.17.3 and invoke pinned registry modules directly:

```sh
fluentci --check-update=false run setup-node@v0.2.0 setup --version 24.22.2 | python3 .github/scripts/export-setup-env.py
fluentci --check-update=false run setup-rust@v0.2.1 setup --toolchain stable --components '["rustfmt", "clippy"]' | python3 .github/scripts/export-setup-env.py
```

The CLI resolves and caches registry components; no SDK compiler or separate
artifact downloader is needed. The environment bridge makes each setup result
available to subsequent GitHub Actions steps. Repository CI modules built from
source continue to run from their local Wasm artifacts.

The legacy `.github/scripts/registry-artifact.py` helper remains available for
older CLI releases that can execute local components but cannot download them
from the registry directly.
