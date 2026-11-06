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
| `cachix`    | `setup`                                                                   | Optional authenticated setup of the `fluentci` binary cache                      |

`cachix` exports `setup`, with `CI.Cachix.setupWith :: String -> Effect Unit`
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
with a configured token fail the job. This configures cache downloads; it does
not upload build outputs.

The Nix build workflow compiles both Wasm modules, then calls Cachix setup before
`nix-build build` on every platform. Configure the `CACHIX_AUTH_TOKEN` repository
secret; the workflow explicitly uses the `fluentci` cache.
No token means no Cachix/Nix setup commands are executed by the Cachix module.

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

## Nix publishing

`fluentci run nix check` and `fluentci run nix metadata` inspect the checked-out
flake without updating its lockfile. Publishing is explicit:

- `fluentci run nix flakehub` needs `flakehub-push`, `RELEASE_VERSION`, and the
  publisher's GitHub/OIDC environment. No automatic Nix publishing workflows
  are configured.
- `fluentci run nix flakestry` needs Nix, `curl`, `jq`, `jo`, `VERSION`, `REF`,
  `GH_TOKEN`, and GitHub's `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and
  `ACTIONS_ID_TOKEN_REQUEST_URL`. It collects metadata in a temporary directory,
  obtains an audience-scoped OIDC token, then submits the publication. Failed
  metadata collection or HTTP requests fail the job. Temporary files are removed.

Publishing functions are never included in the default check.

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

## Nix package build

`.github/workflows/nix-build.yml` runs on pushes to `main` and manual dispatch.
It compiles `.fluentci/nix-build` once on Ubuntu, then downloads that Wasm in
native x86_64 Linux, ARM64 Linux and ARM64 macOS jobs. Each job installs Nix and
invokes the module's `build` export; no guest SDK compiler is needed on the build
runners. The module only runs `nix build --no-write-lock-file .#fluentci`.

This workflow intentionally has no x86_64 Darwin job. Regenerate the integrity-
pinned Bun dependency expression after changing `bun.lock`:

```sh
bun scripts/generate-bun-nix.mjs
bun scripts/generate-bun-nix.mjs --check
```
