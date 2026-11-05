---
title: "Local development"
description: "Build and validate the Bun/Turborepo workspace, Rust CLI, Gleam API, and documentation."
section: "Contribute and deploy"
url: "/development/"
source: "development/index.md"
---

## Prerequisites

Install Rust for the native target, Bun, and Node.js 24+. API development also
requires Gleam and Pkl. Documentation uses Lume 4, installed through the Bun
workspace; Deno is not required to build this site.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev:landing
bun run dev:studio
bun run dev:api
bun run dev:docs
```

Run the selected development servers in separate terminals. The default root
`bun run dev` starts landing and Studio frontend development. The frontend's
local API should be started separately when needed.

## Build Studio before Rust

```sh
cd webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
cd ..
cargo build --release --locked
cargo run --release -- server
```

The Vite Studio server proxies `/graphql` and `/ws` to the local API. Rebuild
embedded assets before compiling a CLI intended to serve updated production UI.

## Validate Rust changes

```sh
cargo fmt --check
cargo clippy --release --all-targets --locked -- -D warnings
cargo test --release --locked
```

Use release mode for Rust builds, runs, and validation. Run tests appropriate to
the change; HTTP/WebSocket tests need loopback listeners. Keep Rust imports in one
contiguous block, with blank lines between functions, types, and implementations.

Always run Clippy after Rust changes. For shared engine changes, also run
`cargo clippy --release --locked --workspace --all-targets -- -D warnings` in
the sibling engine checkout. Validate the desktop crate with
`cargo clippy --release --locked --manifest-path desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`.

## SDK templates

Scaffold tests verify embedded starters without depending on a sibling checkout.
A real SDK build additionally verifies compiler and Wasm export integration. For
ClojureScript, run the mandatory Typed Clojure stage and inspect the `hello`
export after compilation. Do not copy compiler caches or generated output into
a template.

## API and website checks

```sh
cd apps/api
bun run build
bun run lint
bun run typecheck
bun run test
```

For landing, use its `lint`, `build`, and `test:browser` scripts. For docs, see
[Build these docs](/development/documentation/). The root Turborepo build includes
workspace build tasks; native desktop compilation is available separately through
`bun run build:desktop`.

Use conventional commit messages, and include the behavior and relevant
validation in a pull request description.
