![FluentCI Studio](./.github/assets/fluentci-studio.png)

# FluentCI

[![Release](https://github.com/fluentci-io/fluentci/actions/workflows/release.yml/badge.svg)](https://github.com/fluentci-io/fluentci/actions/workflows/release.yml)
[![FlakeHub](https://img.shields.io/endpoint?url=https://flakehub.com/f/fluentci-io/fluentci/badge)](https://flakehub.com/flake/fluentci-io/fluentci)
[![Discord](https://img.shields.io/discord/1132020671262773358?label=discord&logo=discord&color=5865F2)](https://discord.gg/V4U6dPskKc)

FluentCI is a programmable CI/CD tool for building, testing, and deploying your
code locally or on a runner. The Rust CLI combines the
[FluentCI Engine](https://github.com/fluentci-io/fluentci-engine) and
[FluentCI Studio](https://github.com/fluentci-io/fluentci-studio) in one executable.

Run WebAssembly plugins on the host, compose pipelines in TOML, or manage projects
through Studio. The CLI uses Clap and Tokio, serves its GraphQL API and web UI
through Axum, and persists application data in SQLite through SQLx.

Read the [documentation](./docs/site/index.md) for guides covering every SDK,
Studio, publishing, CLI options, and the registry API. The
[documentation workspace](./docs/README.md) runs a Lume 4 site using Bun.

See [ARCHITECTURE.md](ARCHITECTURE.md) for native DAG scheduling, content-addressed
task caching, affected selection, dry runs, and measured performance results.

## Contents

- [Features](#features)
- [Build and install](#build-and-install)
- [Quick start](#quick-start)
- [Pipeline configuration](#pipeline-configuration)
- [Workspace modules](#workspace-modules)
- [WebAssembly plugins](#webassembly-plugins)
- [Studio and GraphQL](#studio-and-graphql)
- [Projects and CI exports](#projects-and-ci-exports)
- [Commands](#commands)
- [Database and settings](#database-and-settings)
- [Caching](#caching)
- [Tracing and logging](#tracing-and-logging)
- [Development](#development)
- [Contributing](#contributing)

## Features

- **One executable:** the CLI embeds Studio assets and links the Wasm engine;
  no separate Studio or engine binary is downloaded.
- **Host execution:** Wasm plugins run on the host with environment providers
  including Nix, Pkgx, Devbox, Flox, Devenv, Hermit, EnvHub, Pixi, and Mise.
- **Reusable pipelines:** search the FluentCI Registry, run published plugins,
  and initialize projects from templates.
- **Pipeline composer:** define named steps, environment variables, and working
  directories in TOML, or edit project actions in Studio.
- **Persistent execution history:** store projects, actions, runs, jobs, logs,
  and settings in SQLite, with transactional writes and schema migrations.
- **Live feedback:** stream execution events over WebSockets, inspect job logs,
  and cancel active runs from Studio.
- **CI exports:** generate GitHub Actions, GitLab CI, Azure Pipelines, CircleCI, Semaphore,
  and AWS CodeBuild manifests from saved project actions.
- **Engine integrations:** use the engine's secret providers, local and remote
  caches, services, and OpenTelemetry tracing from plugins.
- **Existing pipelines:** continue to execute TypeScript/Dagger pipelines with
  their Deno and Dagger runtimes.

## Build and install

### Install with npm

Install the `fluentci` command globally with npm (requires Node.js 20+):

```sh
npm install -g @fluentci/cli
fluentci --version
```

Or run it directly with `npx`:

```sh
npx @fluentci/cli --help
```

To update an existing global installation:

```sh
npm install -g @fluentci/cli@latest
```

The [npm package](./npm/README.md) downloads the matching GitHub release binary
for your platform, verifies its SHA-256 checksum, and caches it for subsequent runs.

### Install script

Install the prebuilt CLI for your platform with curl:

```sh
curl -fsSL https://cli.fluentci.io | sh
export PATH="$HOME/.local/bin:$PATH"
fluentci --version
```

The installer resolves the latest release, detects your OS and architecture,
verifies the archive's SHA-256 checksum, and installs into `~/.local/bin` without
sudo. Linux releases include GNU and musl variants; the installer selects musl
on Alpine (override with `FLUENTCI_LIBC=gnu` or `musl`). It supports Linux/macOS
on x86_64 and arm64, and FreeBSD/NetBSD/OpenBSD on
x86_64. Add `~/.local/bin` to your shell profile's `PATH` to keep it available.

Set `FLUENTCI_VERSION` to override the release version. To change the install
directory, set `FLUENTCI_INSTALL_DIR` on `sh` when piping from curl:

```sh
curl -fsSL https://cli.fluentci.io | \
  FLUENTCI_INSTALL_DIR="$HOME/bin" sh
```

### Ubuntu/Debian

On Debian/Ubuntu systems with glibc **2.39 or newer** (`amd64` and `arm64`):

```sh
echo "deb [trusted=yes] https://apt.fury.io/fluentci/ /" \
  | sudo tee /etc/apt/sources.list.d/fluentci.list
sudo apt-get update
sudo apt-get install fluentci
```

### Fedora/Red Hat

On Fedora and other DNF-based systems with glibc **2.39 or newer**
(`x86_64` and `aarch64`):

```sh
sudo tee /etc/yum.repos.d/fluentci.repo <<'EOF'
[fluentci]
name=FluentCI
baseurl=https://yum.fury.io/fluentci/
enabled=1
gpgcheck=0
EOF
sudo dnf install fluentci
```

Both Linux packages include the CLI and embedded Studio web interface. Start
Studio with `fluentci studio`.

### Install with Homebrew

Add and trust the FluentCI tap before installing:

```sh
brew tap fluentci-io/tap
brew trust fluentci-io/tap
```

Install the CLI:

```sh
brew install fluentci-io/tap/fluentci
```

Install the FluentCI Studio desktop app on macOS:

```sh
brew install --cask fluentci-io/tap/fluentci-studio
```

See [Homebrew's tap trust documentation](https://docs.brew.sh/Tap-Trust) for
details about `brew trust`.

### Install with Nix and Cachix

With [Nix installed](https://nix.dev/install-nix) and the `nix-command` and
`flakes` experimental features enabled, install Cachix, enable the FluentCI
binary cache, then install FluentCI from the upstream GitHub flake:

```sh
nix profile install nixpkgs#cachix
cachix use fluentci
nix profile install github:fluentci-io/fluentci
fluentci --version
```

The `fluentci` cache provides available prebuilt Nix outputs. Nix builds missing
outputs from source. Downloading from this public cache does not require
`CACHIX_AUTH_TOKEN`; the token is needed for CI uploads. See the
[Cachix setup instructions](https://docs.cachix.org/getting-started) for details.

The flake supports `x86_64-linux`, `aarch64-linux`, and `aarch64-darwin`, and
installs the CLI with embedded Studio assets.

### Build from source

Build from a checkout with Rust **1.96 or newer** and Bun installed:

```sh
cd webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
cd ..
cargo build --release --locked
```

Build Studio before compiling Rust: its generated assets are embedded in the
executable. Bun and Node are build dependencies, and are not needed to serve the
compiled Studio UI.

Run the binary directly:

```sh
./target/release/fluentci --help
./target/release/fluentci studio
```

Or install it into a directory on your `PATH`:

```sh
mkdir -p "$HOME/.local/bin"
install -m 755 target/release/fluentci "$HOME/.local/bin/fluentci"
```

Published archives are listed on the
[2026.11.04 release page](https://github.com/tsirysndr/fluentci/releases/tag/2026.11.04).
The release workflow builds Linux and macOS archives for x86_64 and ARM64, plus
native x86_64 FreeBSD, NetBSD, and OpenBSD archives, when a GitHub release is
published. It can also be run manually with an existing release tag. Each target
uploads a `.tar.gz` archive and SHA-256 checksum. Studio builds once on Ubuntu;
BSD guests embed those assets without JavaScript build tools. The workflow
installs the CLI with `fluentci-io/setup-fluentci@next`, then invokes the PureScript
release module for build,
verification, packaging, and upload. That module is compiled once on Ubuntu and
transferred as Wasm to the platform jobs. See the
[BSD release notes](.github/BSD-RELEASES.md) for OS versions and runtime details.

### Runtime tools

| Workflow                             | Additional tools                                         |
| ------------------------------------ | -------------------------------------------------------- |
| Studio, GraphQL, project management  | None                                                     |
| Shell steps                          | Bash and the tools invoked by the step                   |
| Published Wasm plugins               | Tools required by the plugin or its environment provider |
| Building local Rust plugins          | Cargo, Rustup, and the `wasm32-unknown-unknown` target   |
| Existing TypeScript/Dagger pipelines | Deno and Dagger; Docker when required by the pipeline    |
| Terminal documentation               | Glow                                                     |
| Service controls                     | Overmind and its Unix sockets                            |

Plugins and requested toolchains may be downloaded during execution. Hosted
registry and runner commands require network access.

## Quick start

Initialize and run a pipeline in your project directory:

```sh
fluentci init
fluentci ls
fluentci run
```

Initialization creates a root `fluentci.toml` and a default Rust module under
`.fluentci/main`, using the component runtime. The config declares the module and a
`hello` step with its named argument already supplied. Run the
module directly, run the step, or choose a different working directory:

```sh
fluentci run main hello --name FluentCI
fluentci run . hello --name FluentCI
fluentci run --work-dir ./my-project main hello --name FluentCI
```

Search for a reusable pipeline and run a Wasm plugin:

```sh
fluentci search rust
fluentci run --wasm rust test
```

Start Studio:

```sh
fluentci studio
```

## Interactive session

`fluentci repl main` opens a native Rust session for a declared module. Enter a
function such as `check`, or use `run main check` to select a module explicitly.
`modules` lists available functions; `help` shows commands; `exit` leaves the
session. The session also exits on EOF or Ctrl-C.

## Pipeline configuration

FluentCI searches ancestor directories for `fluentci.toml`, falling back to the
legacy `.fluentci/fluentci.toml` layout. Commands can be a string or an array
executed in order:

```toml
[[steps]]
name = "check"
command = ["cargo fmt --all --check", "cargo clippy --release -- -D warnings"]

[[steps]]
name = "test"
command = "cargo test --release"
env = ["CI=true", "RUST_BACKTRACE=1"]

[[steps]]
name = "frontend"
command = "fluentci run --wasm bun run test"
working_directory = "webui"
```

Shell steps run through Bash. A single `fluentci run` command is represented as a
plugin action. `.fluentci/.env` supplies environment variables to child processes;
step variables take precedence. Use `fluentci env` to display that file's values.

See [fixtures](./fixtures) for configuration examples across languages and
frameworks.

## Workspace modules

Declare multiple modules in the root `fluentci.toml`. Local paths are relative
to that file; URL modules point directly to compiled Wasm:

```toml
[[modules]]
name = "main"
path = ".fluentci/main"
sdk = "rust"

[[modules]]
name = "checks"
path = ".fluentci/checks"
sdk = "purescript"

[[modules]]
name = "backend"
path = ".fluentci/backend"
sdk = "elixir"
entry = "Backend"

[[modules]]
name = "shared"
url = "https://example.com/plugins/shared.wasm"
```

Supported SDKs are `rust` (the default), `clojurescript`, `purescript`, `elixir`, `gleam`,
`typescript`, `python`, and `rescript`. A local path can also identify a compiled
`.wasm` file or a Rust `Cargo.toml`. Declared names take precedence over registry
packages, so a local module needs no `--wasm` flag:

```sh
fluentci run main hello
fluentci run checks test
fluentci run shared hello
```

Add modules without replacing existing configuration or comments:

```sh
fluentci modules add checks --sdk purescript
fluentci modules add backend --sdk elixir
fluentci modules add existing --path ./path/to/plugin.wasm
fluentci modules add shared --url https://example.com/plugins/shared.wasm
```

New modules are generated under `.fluentci/<name>`. `--path` registers an existing
source relative to your current directory. For an existing Elixir project, add
`--entry YourPluginModule`. HTTP(S) URLs must end in `.wasm`; query parameters
are supported. Downloads are cached locally and no source build runs for a URL.

Discover modules and their actual exported functions:

```sh
fluentci modules
fluentci modules main
fluentci inspect
fluentci modules --json
```

Discovery builds source modules as needed and inspects their Wasm exports.
Compiler and runtime helpers are hidden for every SDK in text and JSON output.
JSON includes the detected workspace/config paths and each module's name, SDK,
source, artifact, and function names; build logs go to stderr.

### Running from a monorepo package

These commands work from nested package directories. FluentCI walks upwards to
the nearest configuration without crossing a `.git` boundary. Before
initialization, it also recognizes Cargo workspaces, npm/Yarn workspaces, pnpm,
Lerna, Nx, Turborepo, Deno workspaces, and Go workspaces.

```sh
cd apps/backend/src
fluentci run main hello --name FluentCI
fluentci modules add frontend --sdk typescript
```

Commands run at the detected workspace root by default. `--work-dir` sets an
explicit execution directory while retaining workspace module lookup. Step
`working_directory` values are relative to the workspace root. A nested FluentCI
configuration overrides one farther up the directory tree.

### SDK build commands

| SDK           | Default build                                                              | Required tools                                        |
| ------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Rust          | Cargo release build for `wasm32-unknown-unknown`                           | Rust, Cargo, Rustup                                   |
| PureScript    | `npm run build`: Spago → esbuild → extism-js                               | Node/npm, PureScript, Spago, extism-js                |
| ClojureScript | `npm run build`: Typed Clojure check → ClojureScript → esbuild → extism-js | JDK 21+, Clojure CLI, Node/npm, extism-js, Binaryen   |
| Gleam         | `npm run build`: Gleam JS → esbuild → extism-js                            | Node/npm, Gleam, extism-js                            |
| TypeScript    | `npm run build`: esbuild → extism-js                                       | Node/npm, extism-js                                   |
| ReScript      | `npm run build`: ReScript → esbuild → extism-js                            | Node/npm, extism-js; compiler is a package dependency |
| Elixir        | `mix fluentci.plugin.build <entry> --output dist/plugin.wasm`              | Elixir/Mix, Rust with the Wasm target                 |
| Python        | `uv run fluentci-plugin <entry> -o dist/plugin.wasm`                       | uv, extism-py, Binaryen                               |

Every source-module run checks the SDK's required tools and reports all missing
tools before starting its build. Checks also apply during discovery and to cached
source builds. Project-local compilers in `node_modules/.bin` and `.venv/bin` are
recognized. JavaScript-based builders install declared npm dependencies when
`node_modules` is absent, then check the complete toolchain again before building.
Custom `build` commands validate their executable; compiled `.wasm` files and URL
modules use the embedded runtime without needing source compilers.

Generated starters embed the SDK source they need; they do not require a sibling
engine checkout. Python defaults to `entry = "plugin.py"`; Elixir requires its
DSL module as `entry`. Non-Rust builders default to `dist/plugin.wasm`.

Override a project's build command or artifact location when needed:

```toml
[[modules]]
name = "custom"
path = ".fluentci/custom"
sdk = "typescript"
build = ["bun", "run", "build:wasm"]
artifact = "build/custom.wasm"
```

Build commands are argument arrays executed in the module directory. Artifact
paths are relative to the module directory. Rust resolves the selected package's
actual library target and workspace target directory through Cargo metadata.

## WebAssembly plugins

The linked engine uses Extism to execute WebAssembly plugins. Write plugins in
Rust or use one of the engine's
[guest SDKs](https://github.com/fluentci-io/fluentci-engine/tree/main/sdk).

### Rust plugin example

Generate a minimal plugin:

```sh
fluentci init hello-plugin --sdk rust
```

This creates `.fluentci/hello-plugin` and declares it in the root `fluentci.toml`,
with a typed component export in `src/jobs.rs`:

```rust
/// Greeting arguments.
pub struct HelloArgs {
    /// Name to greet.
    pub name: String,
}

/// Greet someone from a native Wasm component.
pub fn hello(args: HelloArgs) -> String {
    format!("Hello, {}!", args.name)
}
```

Run its `hello` export:

```sh
fluentci run hello-plugin hello --name FluentCI
```

The CLI installs the Wasm target, builds the local plugin, and invokes the linked
engine through a worker mode in the same executable. This isolates engine
working-directory and environment changes from concurrent API requests.

You can also run an already compiled module:

```sh
fluentci run --wasm ./target/wasm32-unknown-unknown/release/hello_plugin.wasm hello
```

Choose another language with `fluentci init --sdk typescript` (or another
supported SDK). Rust is the default. `--standalone` generates a reusable plugin
in the current directory. Publishing uses an AT Protocol account and app password:

```sh
export FLUENTCI_ACCOUNT='alice.example'
export FLUENTCI_APP_PASSWORD='replace-with-an-app-password'
fluentci whoami
fluentci publish --name hello-ci --file ./dist/plugin.wasm
```

Package metadata (`name`, `version`, `description`, `license`) belongs to each
`[[modules]]` entry in `fluentci.toml`. `--name` overrides the published name and
can also be entered at a prompt with `--file` or `--url`. Missing metadata is
prompted interactively; only name, version, and license are required. Use
`--name`, `--version`, `--description`, and `--license` for non-interactive runs.

Publishing a new module version reuses descriptive metadata from the authenticated
publisher’s previous PDS record. CLI flags and local module metadata take precedence;
missing required fields still prompt. Release versions and Wasm artifacts are never
copied from an earlier release. Registry references accept `fluentci.io/setup-gh`
as well as `@fluentci.io/setup-gh`; official modules also accept `setup-gh`.

Modules can also publish optional topics, platform compatibility, and an explicit
README URL:

```toml
[[modules]]
name = "ci"
path = ".fluentci/ci"
version = "1.0.0"
license = "MIT"
topics = ["ci", "build"]
os = ["linux", "macos", "freebsd"]
arch = ["x86_64", "aarch64"]
readme_url = "https://raw.githubusercontent.com/example/pipelines/main/README.md"
```

Override these with `--topic`, `--os`, `--arch` (comma-separated or repeated),
and `--readme-url`. Interactive prompts offer topic, OS, and CPU architecture
autocomplete; README and logo URLs are optional prompts too. Press Enter to skip
any optional field. `fluentci docs` uses an
explicit README URL when provided, otherwise it discovers `README.md` from the
module's source repository and subdirectory.

The CLI remembers non-secret identity in `~/.fluentci/account.json`, without
saving the password or session tokens. See [authentication](./docs/site/registry/authentication.md)
and [publishing](./docs/site/registry/publishing.md) for SDK-independent function
metadata (`[[modules.functions]]` or `--manifest`), module builds, and public
Wasm URL publishing.

### Registry and Git modules

Run a published module without creating `fluentci.toml`:

```sh
fluentci @tsiry-sandratraina.com/sccache@v0.1.0 build ...
fluentci @tsiry-sandratraina.com/sccache build ...
fluentci https://plugins.example/shared.wasm hello
```

Declare reusable dependencies with aliases or Git subdirectories:

```toml
[[modules]]
name = "sccache"
package = "@tsiry-sandratraina.com/sccache"

[[modules]]
name = "checks"
git = "https://github.com/example/pipelines.git"
rev = "main"
subdir = "modules/checks"
sdk = "purescript"
```

```sh
fluentci install
fluentci run sccache build ...
fluentci update sccache
fluentci install --frozen-lockfile
fluentci docs checks
```

Commit `fluentci.lock` to pin registry versions/checksums and Git commits. Omitted
versions and `@latest` remain at their locked release until updated. `docs`
renders the module's README with `glow`, using its Git subdirectory when present.
Publishing supports optional `repository` and `subdir` metadata on every module.
See the [configuration](./docs/site/reference/configuration.md) and
[lockfile](./docs/site/reference/lockfile.md) references.

### Environment providers and built-in functions

The engine's Rust PDK exposes `dag()` for environment setup, commands, pipelines,
files, directories, Git repositories, HTTP resources, and services. For example:

```rust
use extism_pdk::*;
use fluentci_pdk::dag;
use fluentci_types::nix::NixArgs;

#[plugin_fn]
pub fn exec(command: String) -> FnResult<String> {
    let stdout = dag()
        .nix(NixArgs { impure: true })?
        .with_exec(command.split_whitespace().collect())?
        .stdout()?;
    Ok(stdout)
}
```

This example additionally uses the `fluentci-pdk` and `fluentci-types` crates. See
the [engine's plugin guide](https://github.com/fluentci-io/fluentci-engine#-plugins)
for available plugins and provider examples. Engine-specific commands such as
`fluentci-engine execute` are not exposed as top-level commands by this CLI.

## Studio and GraphQL

Studio serves the web UI, GraphQL API, and live events on one loopback address:

```sh
fluentci studio --port 6076
```

- Studio: <http://localhost:6076>
- GraphQL and GraphiQL: <http://localhost:6076/graphql>
- WebSocket events: `ws://localhost:6076/ws`

Local Studio does not require a hosted account. Set `FLUENTCI_NO_OPEN=1` to prevent
the CLI from opening a browser automatically. To run only the API:

```sh
fluentci server --port 6076
```

Studio registers the current directory as a project. Named workflows live in
`.fluentci/workflows/*.toml`, with shared modules and services in `fluentci.toml`.
Studio creates and manages these files; execution history is shared with the CLI
through SQLite. Existing project actions remain the **Default** workflow.

```sh
fluentci workflows                # list every project workflow
fluentci workflows --steps        # detailed steps grouped by workflow
fluentci workflows ci --steps     # inspect one workflow
fluentci workflows --steps --json # metadata and nested steps for scripts
fluentci run --workflow ci
```

Use the workflow selector to switch actions, runs, and CI exports. The Actions
composer visually configures push/PR events, branch/tag/path filters, manual CI
dispatch and UTC schedules. These translate to CI providers and never gate local
manual runs. Manage workflows
to rename, duplicate, enable/disable, or delete them. Workflow IDs preserve history
across display-name changes; prepared runs retain snapshots of their actions.
See [workflow configuration](https://docs.fluentci.io/reference/configuration/#multiple-workflows).

Studio includes a dark local workspace, a single status-aware Run/Cancel/Restart
control, collapsible timed steps, live streaming logs, instant log filtering,
and `.txt` log downloads. Build-history bars link to previous runs and show
details on hover or keyboard focus. Press **⌘K / Ctrl+K** to search projects,
workflows (with parent project names), runs, and persisted logs using SQLite FTS5; log results open the matching step.
Actions use ordered command forms, and saved actions can be exported to supported
CI providers. See [Studio development](./webui/README.md) for Storybook, MSW mocks,
and frontend tests.

## Projects and CI exports

```sh
fluentci project create
fluentci project list
fluentci project show <name>
```

To associate a newly created project with the current directory and run its
configured actions:

```sh
FLUENTCI_PROJECT_ID=<name> fluentci run .
```

Export saved project actions as YAML:

```sh
fluentci project export <name> --github
fluentci project export <name> --gitlab
fluentci project export <name> --azure
fluentci project export <name> --circleci
fluentci project export <name> --semaphore
fluentci project export <name> --aws
```

Exports are written to standard output. Redirect the output to the appropriate CI
configuration file. GitHub Actions is the default provider when no flag is given.

## Commands

Run `fluentci --help` or `fluentci <command> --help` for arguments and options.

| Commands                                                         | Purpose                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `run`, or no subcommand                                          | Execute local or published pipelines                            |
| `init`, `search`                                                 | Create pipelines and find reusable packages                     |
| `modules` / `inspect`, `modules add`                             | Discover modules/functions and add local or URL modules         |
| `ls` / `list`, `docs` / `man`                                    | List pipeline jobs and read documentation                       |
| `studio`, `server`                                               | Start the embedded UI or local GraphQL API                      |
| `project create`, `list`, `show`, `export`                       | Manage saved projects and export CI manifests                   |
| `whoami`, `publish`                                              | Authenticate from environment variables and publish packages    |
| `agent`, `agent list`                                            | Connect a hosted runner agent or list agents                    |
| `repl [module]`                                                  | Start a native interactive pipeline session                     |
| `up`, `down`, `ps`, `status`, `start`, `restart`, `stop`, `echo` | Control services and stream their logs                          |
| `env`, `doctor`, `upgrade`, `community`                          | Inspect configuration, diagnose tools, update, and find support |

`fluentci run --remote-exec` is not supported. Run FluentCI directly on a CI runner.
Service controls discover `.fluentci/*/Procfile` and use the associated Overmind sockets.

## Database and settings

The default application database is `~/.fluentci/fluentci.db`. Override it with a
global option or environment variable:

```sh
fluentci --database ./fluentci.db studio
FLUENTCI_DATABASE=./fluentci.db fluentci project list
```

SQLx applies embedded migrations when opening the database. SQLite stores projects,
ordered actions, runs, jobs, logs, cached repository metadata, legacy agent state,
and settings. WAL mode and a busy timeout support concurrent CLI and Studio access;
foreign keys cascade dependent records when a project is deleted.

Existing Deno KV data is not automatically migrated. AT Protocol account passwords
and session tokens are not saved; the account identity file is separate. The engine's build caches and execution
journals retain their own file formats; they are separate from the application
database. See [architecture](./docs/site/development/architecture.md).

## Caching

The embedded engine supports local and remote caches. Configure remote storage
with the same variables used by FluentCI Engine:

| Variable                      | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `FLUENTCI_CACHE_GCS_BUCKET`   | Google Cloud Storage bucket                       |
| `FLUENTCI_CACHE_S3_ENDPOINT`  | S3-compatible endpoint, including R2              |
| `FLUENTCI_CACHE_S3_BUCKET`    | S3-compatible bucket                              |
| `FLUENTCI_CACHE_CDN_ENDPOINT` | Optional CDN endpoint for downloading cached data |

GCS uses `GOOGLE_APPLICATION_CREDENTIALS`. S3-compatible storage uses
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## Tracing and logging

The engine supports OpenTelemetry tracing through `OTEL_EXPORTER_OTLP_ENDPOINT`
or `OTEL_EXPORTER_ZIPKIN_ENDPOINT`. It also supports a Jaeger agent through
`OTEL_EXPORTER_JAEGER_AGENT_HOST` and Baselime logging through `BASELIME_API_KEY`.
Set `RUST_LOG` to configure the CLI's diagnostic logging.

## Development

The JavaScript apps use a Bun workspace and Turborepo with one root `bun.lock`.
Use Bun **1.4.3** (declared in `package.json`) and Node **24+**. From the repository
root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev:landing  # http://localhost:5173
bun run dev:studio   # http://localhost:5174; start the Rust API separately
bun run dev:docs     # http://localhost:4174
bun run dev         # landing + Studio together
```

| Workspace           | Location       | Purpose                                                |
| ------------------- | -------------- | ------------------------------------------------------ |
| `@fluentci/landing` | `apps/landing` | Public React/Vite/Tailwind landing page                |
| `@fluentci/modules` | `apps/modules` | Cloudflare Wasm proxy and background download tracking |
| `@fluentci/api`     | `apps/api`     | Gleam XRPC registry and download counters              |
| `@fluentci/docs`    | `docs`         | Lume 4 documentation, managed with Bun                 |
| `fluentci-studio`   | `webui`        | Studio UI embedded in the CLI and desktop app          |
| `fluentci-desktop`  | `desktop`      | Native Tauri app and release bundle                    |

The landing page uses Lexend for text and Inconsolata for code, with bundled fonts,
SDK examples, install instructions, and a Studio preview. The home page works
independently; module discovery uses the public registry API.
The [download proxy](apps/modules/README.md) preserves storage requests and
reports download counters to the API using a shared private token.
Studio's Vite server proxies to the Rust API on port 6076. To develop Studio:

```sh
# Build the embedded assets before compiling the CLI.
cd webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
cd ..
cargo run --release -- server
# In a second terminal, at the repository root:
bun run dev:studio
```

Workspace checks and production builds:

```sh
bun run build          # landing + Studio; outputs in each workspace's dist/
bun run build:landing  # apps/landing/dist/ only
bun run lint
bun run typecheck
bun run test           # Studio unit tests
bun run test:browser   # landing + Studio browser tests
bun run build:desktop  # explicitly build the native app on the current OS
```

Turborepo caches web builds and checks in `.turbo/`; persistent dev servers, tests,
and native builds are not cached. The desktop task builds Studio first, then uses
the existing release/locked Tauri wrapper. Its standalone commands and CI module
remain available. Do not create lockfiles inside the app workspaces; nested
`bun install` commands use the root workspace lockfile.

This repository's CI is implemented with PureScript Wasm modules under
[`.fluentci`](./.fluentci/README.md), declared in the root `fluentci.toml`.
After building the CLI and installing the PureScript toolchain, run
`fluentci run` for module tests, the Studio build, formatting, release Clippy,
and release Rust tests. `fluentci modules` lists the available functions.

To run the underlying checks directly, build the UI first:

```sh
cd webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
bunx tsc --noEmit
cd ..
cargo fmt --all --check
cargo clippy --release --all-targets --locked -- -D warnings
cargo test --release --locked
```

For frontend development, start `cargo run --release -- server` and then run `bun run dev`
inside `webui`. Vite proxies `/graphql` and `/ws` to the local API on port 6076.
`nix develop` provides a development shell with Rust, Bun, and build tools.
`nix build .#fluentci` builds the CLI with embedded Studio using Crane and Bun.
Supported flake systems are x86_64 Linux, aarch64 Linux, and aarch64 macOS.
After updating `bun.lock`, run `bun scripts/generate-bun-nix.mjs` and commit
`nix/bun-deps.nix`. The Nix build workflow runs on pushes to main and manual dispatch.
See [CI and exports](./docs/site/guides/ci.md) for workflow events and provider setup.

See [Rust development notes](./docs/rust-port.md) for architecture and runtime
requirements, and the [engine](./engine/UPSTREAM.md) and
[Studio](./webui/UPSTREAM.md) source notes for the imported revisions.

## Contributing

Questions, suggestions, and bug reports are welcome through
[GitHub issues](https://github.com/fluentci-io/fluentci/issues/new) and
[Discord](https://discord.gg/V4U6dPskKc). Use the development instructions above to
build and validate changes to the unified Rust CLI.

FluentCI is licensed under the [Mozilla Public License 2.0](./LICENSE). Imported
engine and Studio sources retain their license notices.

## Desktop app

FluentCI Studio also runs as a native Tauri app. It uses its own automatically
assigned API port, so it can run alongside `fluentci studio`. See the
[desktop setup and build guide](desktop/README.md).

Official registry modules published by `fluentci.io` can omit the handle:
`fluentci run sccache setup`, `sccache@v0.1.0`, and `sccache@latest` resolve to
`@fluentci.io/sccache`. This also works in `[[modules]] package = "sccache"`,
implicit `[[modules]] name = "sccache"`, and Studio workflow steps. Local module
aliases retain precedence; other publishers require `@handle/name`.

### Native WebAssembly components

Create modules with `fluentci modules add tools --sdk purescript`.
All eight SDKs generate WIT and native guest adapters from their source contracts
on every build. New modules default to components. Use `--runtime extism` to create
an Extism module; existing manifests without a runtime field retain Extism behavior.
See [the component guide](https://docs.fluentci.io/guides/components/).
