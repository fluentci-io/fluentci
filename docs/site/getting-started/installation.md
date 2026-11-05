---
title: "Installation"
description: "Install the CLI first, then add only the compiler tools required by the SDKs in use."
section: "Start here"
url: "/getting-started/installation/"
source: "getting-started/installation.md"
---

## Install the latest CLI

```sh
curl -fsSL https://cli.fluentci.io | sh
export PATH="$HOME/.local/bin:$PATH"
fluentci --version
```

The installer selects the latest release, detects the platform, verifies its
SHA-256 checksum, and installs to `~/.local/bin`. Persist the PATH change in the
shell profile. The pipe passes the installer script to `sh`; inspect
[install.sh](https://github.com/fluentci-io/fluentci/blob/main/install.sh) before
running it if required by the environment.

Prebuilt CLI targets include Linux and macOS on x86_64 and arm64, and FreeBSD,
NetBSD, and OpenBSD on x86_64. Available desktop packages are described separately
in [Desktop app](/studio/desktop/).

## Pin a version or destination

Set installer options on `sh`, the process receiving the script:

```sh
curl -fsSL https://cli.fluentci.io | \
  FLUENTCI_VERSION=RELEASE_TAG FLUENTCI_INSTALL_DIR="$HOME/bin" sh
```

Replace `RELEASE_TAG` with an existing release. `fluentci upgrade` installs the
latest CLI release. `--check-update=false` disables the CLI's normal update check
for an invocation.

## Install SDK tools

The CLI embeds Studio and the Wasm engine. Node, Deno, and Bun are not needed to
serve the compiled Studio application. Building source plugins needs additional
tools; running a precompiled plugin still needs the tools its commands invoke.

| SDK           | Build requirements                                               |
| ------------- | ---------------------------------------------------------------- |
| Rust          | Cargo, rustc, rustup; Wasm target                                |
| ClojureScript | JDK 21+, Clojure CLI, Node/npm, extism-js, Binaryen              |
| PureScript    | Node/npm, PureScript, Spago, extism-js                           |
| TypeScript    | Node/npm, extism-js                                              |
| Python        | uv, extism-py, wasm-merge, wasm-opt                              |
| Gleam         | Node/npm, Gleam, extism-js                                       |
| Elixir        | Elixir/Mix, Cargo, rustc, rustup; Wasm target                    |
| ReScript      | Node/npm, extism-js; ReScript compiler from package dependencies |

JavaScript guest compilation uses Binaryen tools where required by extism-js.
Keep `wasm-merge` and `wasm-opt` on PATH. `fluentci doctor` checks external tools;
SDK builds additionally report missing SDK-specific tools before executing.

## Build the CLI from source

Use Rust 1.96 or newer for the main native targets and install Bun:

```sh
git clone https://github.com/fluentci-io/fluentci.git
cd fluentci
cd webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
cd ..
cargo build --release --locked
./target/release/fluentci --version
```

Build Studio before Rust: its assets are embedded into the executable. Native
BSD releases have their own compiler/runtime constraints; see the repository's
[BSD release notes](https://github.com/fluentci-io/fluentci/blob/main/.github/BSD-RELEASES.md).
