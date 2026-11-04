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
| `release` | `build`, `package`, `upload` | Target release build, archive/checksum creation, GitHub upload |
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

The only GitHub Actions workflow is `.github/workflows/release.yml`. It runs when
an existing GitHub release is published, or manually with a release tag. It builds
Studio once on Ubuntu and transfers the static assets to the native build jobs.
The CLI builds for Linux/macOS x86_64 and arm64, plus x86_64 FreeBSD, NetBSD, and
OpenBSD. Every target uploads an archive and SHA-256 checksum. BSD guests need no
Bun, Node, Vite, or React build tools. The workflow needs neither a preinstalled
FluentCI binary nor the PureScript toolchain. See the [BSD release notes](../.github/BSD-RELEASES.md).

The PureScript modules remain available for local CI and explicit publishing.

Run the module integration tests independently with:

```sh
node --test .fluentci/tests/modules.test.mjs
```

These tests invoke the release CLI and real compiled PureScript modules. Mock
executables verify command arguments, working directories, ordering, and failure
propagation. Packaging uses real tar and SHA-256 operations against a temporary
fixture. Upload and Nix commands use mocks and do not publish anything.
`FLUENTCI_BIN` can select another release CLI binary.
