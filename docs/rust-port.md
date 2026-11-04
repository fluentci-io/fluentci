# Rust CLI development

The primary entry point is `src/main.rs`. Each command handler lives in its own
`src/commands/<command>.rs`; `src/commands/mod.rs` dispatches the parsed command.
Clap defines the command tree, Tokio runs
asynchronous work, and Axum serves the GraphQL API, WebSocket events and embedded
Studio assets. CLI commands, project detection, interactive sessions, execution,
and persistence are implemented in Rust. The former Deno CLI/server sources,
tests, manifests, and root Dagger module configuration have been removed.
TypeScript remains in the Studio frontend and guest SDKs.

## Build and run

Install stable Rust and Bun, then:

```sh
cd webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
cd ..
cargo build --release --locked
cargo run --release -- studio
```

Studio is served at http://localhost:6076 and GraphQL at `/graphql` on the same
port. `--port` changes both. The default listener is loopback. Set
`FLUENTCI_NO_OPEN=1` to suppress automatic browser opening. All web assets are
embedded in the executable; Node, Bun and a separate Studio server are unnecessary
at runtime. During UI development, run `cargo run --release -- server` and `bun run dev`
in `webui`; Vite proxies `/graphql` and `/ws` to port 6076.

```sh
cargo fmt --all --check
cargo clippy --release --all-targets --locked -- -D warnings
cargo test --release --locked
```

## Persistence

All application database access goes through `src/db.rs`, using SQLx and SQLite.
`migrations/` is embedded in the binary and applied when opening the database.
The default database is `~/.fluentci/fluentci.db`. Override it with
`--database /path/to/fluentci.db` or `FLUENTCI_DATABASE`. WAL mode, foreign keys,
and a busy timeout support the CLI and Studio accessing the same file.

Projects, ordered actions, runs, jobs, logs and settings (including saved access
tokens and agent identity) are persisted in SQLite. Action replacement and run
updates use transactions; deleting a project cascades to dependent data. Existing
Deno KV databases are not automatically migrated. A legacy access-token file is
imported on first authenticated use; new tokens are written to SQLite.

## Integrated source

`webui/` incorporates fluentci-studio commit
`6d34f3fe940709d36bb7767b6d705df2f00ca794`, with its MPL license preserved. Its
React UI now uses the same origin for HTTP and WebSocket connections. Local
Studio does not require Clerk or a hosted account.

`engine/` incorporates fluentci-engine commit
`340e066502e4a7e21274fb122d607fd6f491419e`, including its local Wasmtime patches
and MPL license. The CLI links the engine crate directly. Wasm execution uses a
private worker mode in the **same executable**, isolating the engine's
process-wide environment and working directory from concurrent API requests.
There is no download or execution of a separate `fluentci-engine` binary.
Engine provider workers also re-enter this executable. Wasm plugins, package
manager tools, and user-requested toolchains may still be fetched by the engine.

Existing TypeScript/Dagger pipelines continue to run with Deno and Dagger as
pipeline runtimes; the CLI and its native REPL do not require Deno. REPL commands
invoke the Rust runner directly, including declared Wasm modules. Documentation
rendering uses Glow. Service controls use Overmind's
Unix sockets. Hosted registry/runner operations require their existing remote
services and credentials.

A newly initialized workspace has a root `fluentci.toml` and a module in
`.fluentci/main/`. `init --sdk` chooses from Rust (default), PureScript, Elixir,
Gleam, TypeScript, Python, and ReScript. `modules add` appends declarations while
preserving existing config comments; `--path` and `--url` register existing
modules. SDK starters are embedded from `templates/sdk`, independently of sibling
checkouts.

`src/workspace.rs` finds ancestor FluentCI configuration and workspace roots,
stopping at repository boundaries. `src/modules.rs` resolves declarations,
builds source modules using their SDK, downloads URL modules, and inspects actual
Wasm function exports. Local paths are relative to the declaring config file.
Named module invocation and discovery work from nested monorepo directories;
explicit work directories remain available for execution.

Use `fluentci modules` (alias `inspect`) to discover exports, or `--json` for
structured output. Source builds run during discovery; their logs go to stderr.
The application database remains SQLx/SQLite; downloaded Wasm artifacts are kept
in the OS cache directory under `fluentci/modules`.

## Initial project actions

`src/detection.rs` supplies default actions for supported project manifests when
no FluentCI configuration or saved actions exist. Explicit configuration takes
precedence, and saved user actions are preserved. Studio project creation,
repository imports, and the executor use the same detector. Rust defaults use
release builds and release tests.

## Native interactive session

`fluentci repl [module]` runs an interactive session implemented in Rust. Enter
`run main check`, `modules [name]`, `help`, or `exit`. With a module selected,
enter a function name and arguments directly. Quoted arguments use the same
shell-word parser as the CLI; a failed invocation reports its error and leaves
the session open. The session exits on EOF or Ctrl-C. It does not evaluate
JavaScript or launch a Deno REPL.
