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
fluentci run nix-build build
```

Arguments are WIT strings with source descriptions. These jobs perform effects
and have an explicit WIT unit return type (`Effect Unit` in PureScript). Functions
without inputs take no flags. WIT uses kebab-case names: `build-prepared`,
`linux-dependencies`, `reserve-bsd-disk`, `bsd-build`, `bsd-verify`, `bsd-upload`.
Invalid or missing arguments fail before invoking the job. Runtime configuration
such as target, version, and cache is explicit; tokens stay in the environment.

| Module          | Functions                                                                                                                                                                                                                                                      | Purpose                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `main`          | `check`, `build`                                                                                                                                                                                                                                               | Repository checks and release CLI build    |
| `rust`          | `format`, `lint`, `test`, `check`, `build`                                                                                                                                                                                                                     | Release Cargo checks; Studio builds first  |
| `studio`        | `install`, `build`                                                                                                                                                                                                                                             | Frozen Bun install and embedded web assets |
| `release`       | `prepare`, `build`, `build-prepared`, `check`, `package`, `upload`, `linux-dependencies`, `reserve-bsd-disk`, `bsd-build`, `bsd-verify`, `bsd-upload`, `linux-package-dependencies`, `linux-package`, `linux-package-github`, `linux-package-publish`, `smoke` | CLI releases on Linux, macOS and BSD       |
| `desktop`       | `build`, `clean`, `sign`, `package`, `upload`                                                                                                                                                                                                                  | macOS Studio releases                      |
| `nix`           | `check`, `metadata`, `flakehub`, `flakestry`                                                                                                                                                                                                                   | Nix checks and publication                 |
| `nix-build`     | `build`                                                                                                                                                                                                                                                        | Nix build with FluentCI cache uploads      |
| `cachix`        | `setup`, `push`                                                                                                                                                                                                                                                | Cache configuration and result uploads     |
| `gemfury`       | `upload`                                                                                                                                                                                                                                                       | Published package uploader                 |
| `setup-gemfury` | `setup`                                                                                                                                                                                                                                                        | Published upload prerequisites             |

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

## FluentCI cache and Nix publishing

The Nix build workflow pins FluentCI CLI **v0.17.8**, the latest published
release, and uses the FluentCI cache service on Linux x86_64, Linux ARM64, and
macOS. It compiles the PureScript Nix component to Wasm before running builds.

Add these GitHub Actions repository **variables**:

| Variable                  | Value                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `FLUENTCI_CACHE_URL`      | Stable DID URL from the cache page: `https://cache.fluentci.io/did:plc:YOUR_DID`, without `/nix`; legacy hash URLs remain supported |
| `FLUENTCI_NIX_PUBLIC_KEY` | Complete public key, such as `fluentci-1:<base64>`                                                                                  |

Add these repository **secrets**:

| Secret                     | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| `FLUENTCI_CACHE_TOKEN`     | Upload token generated on the cache page; valid until revoked |
| `FLUENTCI_NIX_SIGNING_KEY` | Complete private signing-key file contents, not a path        |

Generate a matching key pair outside the checkout:

```sh
nix-store --generate-binary-cache-key fluentci-1 nix-private.key nix-public.key
```

Public reads require only the two variables. Uploads require both secrets.
With no cache configuration the build uses default Nix substituters; incomplete
configuration fails. Cache selection, retries, signing policy, scheduling, and
publishing are implemented in PureScript (`CI.CacheHost`); a small JavaScript FFI
provides Node process, streaming HTTP, filesystem, URL, JSON, and crypto operations.
The build packages this host program beside the Wasm component.

During a build the publisher polls every two seconds. Before exporting paths,
it checks `cache.nixos.org` and the FluentCI cache for existing narinfo. Verified
remote metadata satisfies reference validity in the temporary export cache, so
already available dependencies do not need to be recompressed or uploaded.
Only missing artifacts are signed and exported with Zstandard level 3. Shared
references are deduplicated across batches, and verification only examines new
metadata. Public upstream dependencies remain available through Nix's default
substituters; `extra-substituters` adds FluentCI without replacing them.

Compilation and publishing run concurrently. The job drains pending uploads
before finishing, preserving completed artifacts even if compilation later fails.
Logs report build completion separately from cache lookup, export/verification,
and upload time. Compressed payloads are removed locally after upload while
metadata remains available for reference checks.

Every export is signed with the private key. Before uploading, the helper checks
for the configured key's signature on each new narinfo and asks Nix to verify those
signatures. It uploads NARs before narinfo metadata, with at most 16 concurrent
HTTP uploads. Transient HTTP 408/425/429/5xx errors and transport timeouts retry
up to three times with fresh file streams and bounded backoff. Each attempt has
a 125-minute deadline; the production cache service allows two hours per upload.
Permanent errors or exhausted retries cancel the build client and fail CI; private keys
and exported files are cleaned up. The workflow limits Nix HTTP connections to 16.
Signing keys are temporary files outside the checkout and are removed after
publishing. Credentials never appear in command arguments. The workflow
preserves GitHub authentication through `GH_TOKEN` and `NIX_CONFIG`.

```sh
fluentci run nix-build build
```

Nix publishers require their tools and GitHub OIDC variables. FlakeHub also needs
`FLAKEHUB_PUSH_GITHUB_TOKEN`; Flakestry uses `GH_TOKEN`. The publishing workflows
accept an existing tag and call the registry `nix-publish@v0.2.0` component on the
resolved tag revision. `setup-determinate-nix` provisions Nix;
`setup-flakehub-push` provisions FlakeHub publishing, and `setup-bun` supplies
Flakestry’s HTTP/JSON runtime. No publishing Wasm is compiled in these workflows.
Each publication has an explicit fresh `--run-dir`, and FlakeHub receives
`--name "$GITHUB_REPOSITORY"`. Neither publishing function runs in the default check.

## Linux packages and Gemfury

FluentCI-specific Debian/RPM metadata lives in the release module. The old local
Gemfury module is removed; uploading uses published components pinned in the root
registry and lockfile: `gemfury@0.1.0` and `setup-gemfury@0.1.0`.

```sh
fluentci run release linux-package-dependencies --target x86_64-unknown-linux-gnu
fluentci run release linux-package --target x86_64-unknown-linux-gnu --version v0.17.4
fluentci run --frozen-lockfile setup-gemfury setup
fluentci run --frozen-lockfile gemfury upload --files target/release-assets/fluentci_0.17.4_amd64.deb,target/release-assets/fluentci-0.17.4-1.x86_64.rpm
```

`FURY_ACCOUNT`, `FURY_USER`, and `FURY_TOKEN` remain environment credentials.
The published uploader skips missing/blank tokens and propagates upload failures.
CI exports the setup result through the existing GitHub environment bridge.
Package creation supports GNU/Linux x86_64 and ARM64; musl targets publish separate
checksum-verified tarballs instead of replacing the GNU Debian/RPM packages.

Release builds also include `x86_64-unknown-linux-musl` and
`aarch64-unknown-linux-musl`. Their native runner uses `musl-gcc`; CI verifies static
ELF linkage, then checks CLI startup, SQLite, Extism host imports and a typed Wasm
component inside Alpine without glibc compatibility libraries.

## GitHub Actions environment handoff

Setup components return their installation directory and environment as typed
values. Workflows pipe that result to the BEAM `fluentci_ci export-setup-env` command,
which persists PATH additions in `GITHUB_PATH` and variables such as `CARGO_HOME`,
`RUSTUP_HOME`, and `JAVA_HOME` in `GITHUB_ENV`. This is necessary because each
Actions step runs in a separate process. Tool installers run inside Wasm; the
Gleam helper only exports the returned values and validates their shape.

The setup bridge has standalone tests that do not install tools or invoke the CLI:

```sh
escript .github/scripts/fluentci_ci test
```

### Bootstrap CLI compatibility

Workflows bootstrap FluentCI v0.17.3 and invoke pinned registry modules directly:

```sh
fluentci --check-update=false run setup-node@v0.2.0 setup --version 24.22.2 | escript .github/scripts/fluentci_ci export-setup-env
fluentci --check-update=false run setup-rust@0.2.2 setup --toolchain stable --components rustfmt,clippy | escript .github/scripts/fluentci_ci export-setup-env
```

The CLI resolves and caches registry components; no SDK compiler or separate
artifact downloader is needed. The environment bridge makes each setup result
available to subsequent GitHub Actions steps. Repository CI modules built from
source continue to run from their local Wasm artifacts.

The BEAM `fluentci_ci registry-artifact` command remains available for
older CLI releases that can execute local components but cannot download them
from the registry directly.

## BEAM helper bootstrap

GitHub jobs call `.github/actions/setup-ci-scripts` after bootstrapping FluentCI.
It installs OTP 27 and Gleam 1.17 using the published setup modules before
compiling a single portable escript. App SDK jobs can select newer toolchains
afterward. BSD guests receive that compiled escript, install Erlang/Gleam with
the same setup modules, and invoke helpers with `escript`; they do not need
Node.js or a compiler matching the host's Gleam source syntax. Minimal native
package/bootstrap commands remain inline because FluentCI must exist before it
can install the toolchains. See [.github/scripts](../.github/scripts/README.md).


Nix CI enables `substitute` and `always-allow-substitutes`, including dependency
helpers that set `allowSubstitutes = false`. Exact outputs available in the
configured FluentCI binary cache are restored rather than rebuilt. The negative
narinfo cache TTL is zero so misses cannot hide outputs uploaded later in the job.
Store paths, platform, and trusted signatures must still match.


The reusable `cache` component is authored in `../fluentci-modules/caching/cache`.
`.fluentci/cache` carries a self-contained CI copy until its registry release is
published. Its host policy and archive primitives are identical; the CI entry
uses tools already provisioned by the workflow. It supports protocol setup,
signed watched Nix builds, and compressed generic HTTP save/restore.

The **Cache build test** workflow is manual-only (`cache-build.yml`) and builds
all nine currently shipped CLI targets, including the three BSD systems. It uses
`vars.FLUENTCI_CACHE_URL` and `secrets.FLUENTCI_CACHE_TOKEN`; no additional secret
is needed. Choose `auto` for sccache on Linux/macOS or `generic` to exercise HTTP
archive caching. BSD always restores/saves its Cargo target directory through the
generic backend. Compression can be zstd (default), gzip, or none. The workflow
shares prepared inputs using a short-lived Actions artifact; it does not package,
publish, upload release assets, or create a release. Existing CI and release
workflows are unchanged.
