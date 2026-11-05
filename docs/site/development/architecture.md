---
title: "Architecture"
description: "How the Rust CLI, embedded engine, Studio, desktop app, and Gleam registry fit together."
section: "Contribute and deploy"
url: "/development/architecture/"
source: "development/architecture.md"
---

## Unified local application

The Rust application parses commands with Clap, runs async work on Tokio, and
serves the local API with Axum and async-graphql. Studio's React assets are
embedded at compile time. The CLI links imported engine crates instead of
requiring a separate engine executable download.

| Area                               | Source                                                |
| ---------------------------------- | ----------------------------------------------------- |
| Command parsing and dispatch       | `src/cli.rs`, `src/commands/`                         |
| Workspace/configuration discovery  | `src/workspace.rs`, `src/config.rs`                   |
| Module builds and scaffolds        | `src/modules.rs`, `src/scaffold.rs`, `templates/sdk/` |
| Pipeline execution and live events | `src/pipeline.rs`, `src/executor.rs`                  |
| Local persistence                  | `src/db.rs`, `migrations/`                            |
| Studio                             | `webui/`                                              |
| Tauri app                          | `desktop/`                                            |
| Public package registry            | `apps/api/`                                           |
| Marketing and documentation        | `apps/landing/`, `docs/`                              |

## Engine integration

`engine/crates` and vendored runtime patches are imported source. `engine/UPSTREAM.md`
records the upstream revision and local integration. The library entry point
exposes engine commands; internal worker invocations isolate engine calls from
the normal CLI command parser. Preserve platform-specific patches when syncing
instead of replacing the directory blindly.

Run `python3 scripts/sync-engine.py` from the repository root to compare shared
engine crates, selected vendored fixes, and bundled SDK sources with `../fluentci-engine`.
Use `--write` to copy these sources to that checkout, then update its Cargo
lockfile and run release checks. The script preserves the CLI integration
wrapper and integration-specific manifests, and excludes build output. It does not sync the entire repositories or
delete sibling files; review removals separately.

Wasm source templates contain only their necessary guest SDK/build source. Their
language-level exports are adapted to the common plugin ABI. Compiler/runtime
helper exports are filtered during discovery.

## Persistence boundaries

The local application uses SQLx/SQLite and SeaQuery construction. Projects,
actions, runs, jobs, logs, and Tangled cache metadata are local application state.
Engine caches and native execution journals use their own storage contracts.

The registry has a separate SQLite database. Its application queries and table
schemas are defined in Gleam through typed Drizzle bindings; JavaScript supplies
the generic ORM bridge and Node I/O. Pkl is the source of truth for its lexicons.
Do not combine the local Studio GraphQL API with the public registry XRPC API.

## Desktop and credentials

The desktop app has an independent loopback listener. Remembered account identity
is shared through a non-secret file, while app passwords and session tokens stay
in the CLI process performing authentication. The background Tangled worker reads
public PDS records without inheriting the app password.
