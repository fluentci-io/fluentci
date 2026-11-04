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

| Module | Functions | Purpose |
| --- | --- | --- |
| `main` | `check`, `build` | Standard repository checks and release CLI build |
| `rust` | `format`, `lint`, `test`, `check`, `build` | Cargo formatting, linting, tests, and builds |
| `studio` | `install`, `build` | Frozen Bun dependency install and embedded Studio web assets |
| `release` | `prepare`, `build`, `buildPrepared`, `check`, `package`, `upload`, `bsd*` | Release inputs, native builds, verification, and uploads |
| `nix` | `check`, `metadata`, `flakehub`, `flakestry` | Flake validation, inspection, and explicit publishing |

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
