# FluentCI's own CI

All repository CI modules use the PureScript Wasm SDK. The root
[`fluentci.toml`](../fluentci.toml) declares their names and source directories.
Run them from the root or any nested repository directory:

```sh
fluentci modules
fluentci run                 # main.check: CI module tests, Studio, Rust checks
fluentci run rust format
fluentci run rust lint
fluentci run rust test
fluentci run studio build
fluentci run main build      # Studio + host release CLI
```

| Module      | Functions                                                                 | Purpose                                                                          |
| ----------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `main`      | `check`, `build`                                                          | Standard repository checks and release CLI build                                 |
| `rust`      | `format`, `lint`, `test`, `check`, `build`                                | Cargo formatting, linting, tests, and builds                                     |
| `desktop`   | `build`, `sign`, `package`, `upload`                                      | macOS Studio builds, verified ad hoc signatures, installers, and release uploads |
| `studio`    | `install`, `build`                                                        | Frozen Bun dependency install and embedded Studio web assets                     |
| `release`   | `prepare`, `build`, `buildPrepared`, `check`, `package`, `upload`, `bsd*` | Release inputs, native builds, verification, and uploads                         |
| `nix`       | `check`, `metadata`, `flakehub`, `flakestry`                              | Flake validation, inspection, and explicit publishing                            |
| `nix-build` | `build`                                                                   | Build the locked FluentCI Nix package with `nix build`                           |
| `cachix`    | `setup`, `push`                                                           | Authenticated setup and uploads for the `fluentci` binary cache                  |
| `gemfury`   | `dependencies`, `package`, `upload`, `github`                             | Native Debian/RPM packaging and Gemfury uploads for x86_64 and arm64 Linux       |

`cachix` exports `setup` and `push`, with `CI.Cachix.setupWith :: String -> Effect Unit`
for PureScript composition. Pass the cache name (the Cachix key identifying the
cache) as input, or set `CACHIX_CACHE`:

```sh
fluentci run cachix setup fluentci
```

The module reads `CACHIX_AUTH_TOKEN` from the host environment. Missing, empty,
or whitespace-only tokens skip setup successfully, so builds continue without
Cachix. With a token, it validates the cache name and runs `cachix use` through
`nix run --inputs-from . nixpkgs#cachix`, reusing the checkout's pinned nixpkgs
input. The token is never passed as a command argument or printed. Setup errors
with a configured token fail the job.

The Nix build workflow compiles both Wasm modules, then calls Cachix setup before
`nix-build build` on every platform. Configure the `CACHIX_AUTH_TOKEN` repository
secret; the workflow explicitly uses the `fluentci` cache.
The Nix build module composes `CI.Cachix.runWithCache` to run the build inside
`cachix watch-exec fluentci -- nix build ...`, uploading new store paths as they
are produced, including build dependencies and Crane artifacts. After a successful
build, `CI.Cachix.pushResultWith` pushes `./result` and its runtime closure too,
even if the build reused existing paths. Upload/authentication failures propagate
to CI. The token stays in the environment throughout.

Without a token, `nix build` still runs, while Cachix setup and uploads are skipped.
To upload an existing build result explicitly:

```sh
fluentci run cachix push fluentci
```

This requires an existing `./result` symlink and a token with write access to the
`fluentci` cache. No local Nix build is required just to compile/test these modules.

`common` is a shared PureScript source package, not a Wasm module. The modules
reuse it through Spago path dependencies. `main`, `rust`, and `release` compose
Studio jobs as PureScript functions; they do not invoke another CLI or assume
another module has already been compiled.

## Setup

First build the local Rust CLI following the root README. Install Node 24,
PureScript 0.15.16, Spago 1.0.5, and the Extism JavaScript compiler:

```sh
npm install --global purescript@0.15.16 spago@1.0.5
# Install extism-js from https://github.com/extism/js-pdk/releases.
export PATH="$PWD/target/release:$PATH"
fluentci modules
```

The CLI checks tool availability each time it builds a module. npm and Spago
lockfiles pin each module's dependencies, including the FluentCI SDK revision.
Generated JavaScript, Wasm artifacts, package caches, and editor state are ignored.

Rust lint/test/build jobs prepare Studio assets before invoking Cargo. All Cargo
builds, lint checks, and tests use `--release --locked`. The default check includes
all Cargo targets for Clippy and denies warnings.

## Release assets

Build and package a specific target with:

```sh
export TARGET=aarch64-apple-darwin
export RELEASE_VERSION=v0.16.8
fluentci run release build
fluentci run release package
```

`build` prepares Studio locally. `buildPrepared` requires an existing
`webui/dist/index.html` and builds only the target binary; platform jobs use it
after downloading the Studio artifact. `check` runs the target binary's version
and help commands.

Archives and SHA-256 checksum files are written under `target/release-assets/`.
Each archive contains a single `fluentci` executable at its root, matching the
installer's expected layout. Packaging reads the selected target's existing
release binary; it does not rebuild it.

`fluentci run release upload` publishes the two files using `gh release upload`.
It requires an existing GitHub release and authenticated GitHub CLI (`GH_TOKEN`
in Actions). Uploading is separate from checks and packaging.

## Gemfury Debian and RPM packages

The release workflow builds `.deb` and `.rpm` packages on the native x86_64 and
arm64 Linux runners using the `gemfury` PureScript Wasm module. Packages contain
the CLI, its embedded Studio web interface, and the license. They are uploaded
to the GitHub release with SHA-256 sidecars and optionally to Gemfury.

`CI.LinuxPackages` implements version and architecture validation, Debian control
and RPM spec generation, staging, metadata verification, checksums, and cleanup
in PureScript. It writes metadata with native file primitives and invokes
`dpkg-deb` and `rpmbuild` with literal argument vectors. No packaging shell helper
is generated or executed. Gemfury and GitHub uploads also use direct argument
vectors; `gemfury github` uploads the packages and sidecars to the release.

Set the GitHub Actions secrets `FURY_USER`, `FURY_TOKEN`, and `FURY_ACCOUNT` to
enable Gemfury uploads. `FURY_USER` authenticates with `FURY_TOKEN`, while
`FURY_ACCOUNT` selects the destination account. User and account may alternatively
be repository variables; secrets take precedence. A missing or blank token skips
Gemfury; missing authentication user, an invalid account,
missing package, authentication failure, or rejected upload fails the job.
Like the `music-player` publisher, curl expands credentials directly from the
environment with `--variable` and `--expand-user`, keeping it out of command
arguments and pipeline plans. Uploading requires curl 8.3 or newer.

```sh
export TARGET=x86_64-unknown-linux-gnu # Or aarch64-unknown-linux-gnu
export RELEASE_VERSION=v0.17.0
fluentci run gemfury dependencies
fluentci run gemfury package
# Set FURY_USER, FURY_TOKEN, and FURY_ACCOUNT before uploading.
fluentci run gemfury upload
```

`package` requires an existing `target/$TARGET/release/fluentci`, built in
release mode. Debian packages use `amd64`/`arm64`; RPMs use `x86_64`/`aarch64`.
Both package metadata and architecture are checked before publishing. The
Ubuntu 24.04 release binaries require glibc 2.39 or newer, which is declared in
the packages. Results are written under `target/release-assets/`. Building
packages does not need Gemfury credentials.

## Nix publishing

`fluentci run nix check` and `fluentci run nix metadata` inspect the checked-out
flake without updating its lockfile. Publishing is explicit:

- `fluentci run nix flakehub` needs `flakehub-push`, `RELEASE_VERSION`,
  `FLAKEHUB_PUSH_GITHUB_TOKEN`, and GitHub's `ACTIONS_ID_TOKEN_REQUEST_TOKEN`
  and `ACTIONS_ID_TOKEN_REQUEST_URL`. The workflow explicitly supplies the
  publisher's token variable; setting `GITHUB_TOKEN` alone is insufficient.
- `fluentci run nix flakestry` needs Nix, `curl`, `jq`, `jo`, `VERSION`, `REF`,
  `GH_TOKEN`, and GitHub's `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and
  `ACTIONS_ID_TOKEN_REQUEST_URL`. It collects metadata in a temporary directory,
  obtains an audience-scoped OIDC token, then submits the publication. Failed
  metadata collection or HTTP requests fail the job. Temporary files are removed.

Publishing functions are never included in the default check.

The `Publish tags to FlakeHub` and `Publish tags to Flakestry` GitHub workflows
publish release tags such as `v0.17.0` in `fluentci-io/fluentci`. Each also supports
**Run workflow** with a required existing `tag`, including older release tags.
They share `nix-publish.yml`, which resolves the tag to a commit, compiles and tests
the PureScript publishing module, then checks out that exact commit in a separate
publishing job. Publication runs through `fluentci run --wasm … flakehub` or
`flakestry`, using GitHub OIDC and the job's GitHub token; no registry secret is
required. Forks skip publication. The publishing runner installs the registry
tools and Nix; the target tag does not need a prebuilt Wasm artifact.

## GitHub releases and module tests

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting
`main`. It uses `fluentci-io/setup-fluentci@next` to install the CLI, installs the
SDK compiler toolchain, then invokes `fluentci run main check` for module tests,
Studio assets, formatting, Clippy, and release Rust tests. `FLUENTCI_BIN` points
module integration tests at the installed CLI in a fresh checkout. Before testing,
CI builds all modules to verify the complete compiler and bundler toolchain.
The shared bootstrap installs PureScript 0.15.16, Spago 1.0.5, Extism JS 1.7.0,
and Binaryen 133 (`wasm-merge` and `wasm-opt`), verifies download checksums, and
checks each executable's version. Node 24, npm, Git, and native shared libraries
are checked or installed as well. The CLI installs each module's local esbuild
package from its npm lockfile. CI disables
LTO for test executables while retaining release optimization.

The release workflow is `.github/workflows/release.yml`. Its GitHub runner jobs
install FluentCI with `fluentci-io/setup-fluentci@next`. The action's `version`
input reads `FLUENTCI_VERSION`, which selects the existing `2026.11.04` bootstrap
CLI. `RELEASE_VERSION` identifies the release being built.

The root `fluentci.toml` declares private CI modules using only the bootstrap's
supported fields: `name`, `path`, `url`, `sdk`, `entry`, `artifact`, and `build`.
Do not add publishing metadata such as `version`, `description`, or `license` to
these declarations while this older CLI is pinned: it rejects unknown fields
before it can build or run a module. Newer CLIs still support that metadata for
publishable modules. The configuration tests guard this bootstrap compatibility.

The Ubuntu input job installs the PureScript/Spago/Extism compiler toolchain and
runs `fluentci run release prepare`. That module validates the release and BSD
checks, generates Wasm fixtures, and builds Studio once. The job publishes the
compiled release module along with those portable inputs.

All Linux/macOS jobs, BSD host jobs, and BSD guests invoke the precompiled module:

```sh
fluentci --check-update=false run --wasm .fluentci/release/dist/plugin.wasm buildPrepared
```

They do not build PureScript sources or need its compiler toolchain. Native BSD
guests also do not install Node, Bun, Vite, or React build tools. Inside each VM,
the CLI is bootstrapped with its native curl installer; the JavaScript setup
action runs on the outer GitHub runner. Their `bsdBuild`
function invokes the existing native build/smoke/package helper; `bsdVerify` and
`bsdUpload` validate and publish copied-back assets on Ubuntu.

YAML retains checkout, tool setup, caches, artifact transfer, and VM startup.
Preparation, dependency installation, build, binary checks, packaging, archive
verification, and uploads run through PureScript module functions. The initial
SDK compiler setup happens only in `.fluentci/scripts/install-sdk-tools.sh` on
Ubuntu; BSD package preparation installs the tools needed to bootstrap the CLI.
The PureScript modules remain available for local CI and explicit publishing.
See the [BSD release notes](../.github/BSD-RELEASES.md).

Run the module integration tests independently with:

```sh
node --test .fluentci/tests/modules.test.mjs
```

These tests invoke the release CLI and real compiled PureScript modules. Mock
executables verify command arguments, working directories, ordering, and failure
propagation. Packaging uses real tar and SHA-256 operations against a temporary
fixture. Upload and Nix commands use mocks and do not publish anything.
`FLUENTCI_BIN` can select another release CLI binary.

## Desktop releases

The **Studio desktop** workflow (`.github/workflows/desktop-release.yml`) runs on
published releases and through **Actions → Studio desktop → Run workflow**.
Select any branch and leave `tag` empty for a standalone build; installers remain
available as workflow artifacts for 14 days and nothing is published. Supply an
existing release tag to upload the selected branch's installers to that release.
Manual runs always build the selected branch, pinned to the triggering commit;
the optional tag selects only the upload destination. Published-release events
build the release tag's commit.
Both paths build `aarch64-apple-darwin` on Apple Silicon and
`x86_64-apple-darwin` on Intel macOS runners.

The Ubuntu preparation job compiles `desktop` once to portable Wasm; macOS jobs
need Bun and Rust, without the PureScript compiler toolchain. The module uses
the desktop wrapper's release/locked build and Studio asset hook. It signs with
`codesign --force --deep --sign -` and verifies with
`codesign --verify --deep --strict --verbose=2`, matching Rocksky Desktop.
These builds are ad hoc signed, without Apple Developer signing or notarization.

To build and package locally on macOS:

```sh
export TARGET=aarch64-apple-darwin # or x86_64-apple-darwin
export RELEASE_VERSION=2026.11.04
fluentci run desktop build
fluentci run desktop package     # signs, verifies, creates DMG + app ZIP + SHA-256
# Explicit publication to an existing release (requires GH_TOKEN):
fluentci run desktop upload
```

Outputs are `desktop/release-assets/FluentCI-Studio_<tag>_<target>.dmg`,
`.app.zip`, and individual `.sha256` files. Packaging refuses to create archives
if signing or verification fails. `sign` is also available as a separate job.

After bundling, desktop CI runs `clean` to remove the workspace crates' Cargo
products, stale debug builds, incremental directories, and installed frontend
dependencies while preserving the app bundle, Bun download cache, and reusable
Cargo dependency artifacts. Cleanup skips outside GitHub
Actions. DMGs use explicit HFS+ capacity based on logical bytes and allocated
blocks, with 50% headroom plus 128 MiB, and are verified before ZIP/checksum
generation. This avoids undersized images when source files are sparse or
compressed and reports runner disk space in the packaging log.

## Nix package build

`.github/workflows/nix-build.yml` runs on pushes to `main` and manual dispatch.
It compiles `.fluentci/nix-build` once on Ubuntu, then downloads that Wasm in
native x86_64 Linux, ARM64 Linux and ARM64 macOS jobs. Each job installs Nix and
invokes the module's `build` export; no guest SDK compiler is needed on the build
runners. With `CACHIX_AUTH_TOKEN`, the build runs under `cachix watch-exec` and
then pushes `./result` to the `fluentci` cache. Without the token it runs
`nix build --no-write-lock-file .#fluentci` directly and skips cache uploads.

This workflow intentionally has no x86_64 Darwin job. Regenerate the integrity-
pinned Bun dependency expression after changing `bun.lock`:

```sh
bun scripts/generate-bun-nix.mjs
bun scripts/generate-bun-nix.mjs --check
```
