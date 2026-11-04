
![Cover](https://github.com/fluentci-io/fluentci-engine/raw/HEAD/.github/assets/ui.png)

# FluentCI Engine
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/fluentci-io/fluentci-engine/total?label=gh%20downloads)
[![FlakeHub](https://img.shields.io/endpoint?url=https://flakehub.com/f/fluentci-io/fluentci-engine/badge)](https://flakehub.com/flake/fluentci-io/fluentci-engine)
[![built with nix](https://img.shields.io/badge/Built_With-Nix-5277C3.svg?logo=nixos&labelColor=73C3D5)](https://builtwithnix.org)
[![flakestry.dev](https://flakestry.dev/api/badge/flake/github/fluentci-io/fluentci-engine)](https://flakestry.dev/flake/github/fluentci-io/fluentci-engine)
[![crates](https://img.shields.io/crates/v/fluentci-engine.svg)](https://crates.io/crates/fluentci-engine)
[![ci](https://github.com/fluentci-io/fluentci-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/fluentci-io/fluentci-engine/actions/workflows/ci.yml)
[![discord](https://img.shields.io/discord/1132020671262773358?label=discord&logo=discord&color=5865F2)](https://discord.gg/V4U6dPskKc)

_If you love FluentCI, please ★ star this repository to show your support 💚. Looking for support? Join our [Discord](https://discord.gg/V4U6dPskKc)._

FluentCI Engine is a programmable CI/CD engine (used by [FluentCI](https://github.com/fluentci-io/fluentci)) that is designed to be simple, flexible, and easy to use. It is supposed to run on the host machine without containerization or virtualization, and it is designed to be used with [Nix](https://nixos.org), [Pkgx](https://pkgx.sh), [Devbox](https://www.jetpack.io/devbox/), [Flox](https://flox.dev), [Devenv](https://devenv.sh), [Hermit](https://github.com/cashapp/hermit), [EnvHub](https://github.com/tsirysndr/envhub), [Pixi](https://pixi.sh/) and [Mise](https://mise.jdx.dev/).

## Table of contents

- [Features](#-features)
- [Host execution plans](#host-execution-plans)
- [Parallel matrix jobs](#parallel-matrix-jobs)
- [Quick Start](#-quick-start)
- [Downloads](#-downloads)
- [Documentation](#-documentation)
- [Plugins](#-plugins)
  - [Rust Plugin Example](#-rust-plugin-example)
  - [Available Plugins](#-available-plugins)
  - [Builtin functions](#-builtin-functions)
- [GitHub Actions](#-github-actions)
- [Caching](#-caching)
- [OpenTelemetry Tracing](#-opentelemetry-tracing)
- [Logging](#-logging)

![Made with VHS](https://vhs.charm.sh/vhs-o1fkvlKvsyAPUbKUXTyyS.gif)

> [!NOTE]
> **Project Status: 🐲 Unstable, alpha-ish quality.**
> This project is still in the early stages of development,
> and it is not yet ready for production use.
> It is not feature-complete, and it is not yet stable. Use at your own risk.

![Cover](https://github.com/fluentci-io/fluentci-engine/raw/HEAD/.github/assets/api.png)

## ✨ Features

- [x] Simple and easy to use
- [x] Flexible
- [x] No containerization or virtualization
- [x] Built-in support for Nix, Hermit, Pkgx, Devbox, Flox, Devenv, Envhub, Mise and Pixi
- [x] Built-in support for Secrets (backends: [Google Secret Manager](https://cloud.google.com/secret-manager), [AWS Secrets Manager](https://aws.amazon.com/fr/secrets-manager/), [Azure Key Vault](https://azure.microsoft.com/fr-fr/products/key-vault) and [HashiCorp Vault](https://www.vaultproject.io/))
- [x] Built-in support for Services
- [x] Cache support (backends: local, S3, GCS, R2)
- [x] Wasm plugin SDKs for Python, Elixir (CI DSL), Gleam, ReScript, PureScript, and TypeScript; see [SDK guides](./sdk)
- [x] GraphQL API, see [API Documentation](./docs/api.md)
- [x] [OpenTelemetry](https://opentelemetry.io/) tracing
- [x] Plugin system in WebAssembly, see [examples](./examples)

## Host execution plans

A shared host executor powers `fluentci-engine execute` and the legacy GraphQL/Wasm
adapters, with
bounded parallelism, dependency validation, per-task environments, cancellation,
and structured results. See [host execution plans](docs/host-executor.md) for the
versioned plan format, functional SDK direction, and current limitations.
[Elixir host plans](sdk/elixir/HOST_PLANS.md) provide immutable `|>` builders, pure
JSON compilation, typed results, and managed local execution with cancellation.

Version **0.6.1** provides unified execution, parallel matrices, workflow primitives,
and native file and env-file tasks. See the [0.6 compatibility notes](docs/compatibility-0.6.md) for
migration guidance, legacy scheduling/service limits, and supported guest build paths.

## Parallel matrix jobs

Pure matrix builders expand named cases and Cartesian products into native tasks,
with include/exclude filters, stable IDs, prerequisites and joins. `jobs` bounds
concurrency; each case uses normal execution, caching, logs and cancellation.
Matching guest SDKs submit a complete independent plan through `execute_plan`.
See [matrix jobs](docs/matrix.md) for all six language APIs and current boundaries.
This API requires FluentCI Engine 0.6.1 or later and matching guest SDKs.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/fluentci-io/fluentci-engine.git
# Go to the project directory
cd fluentci-engine
# Install dependencies
nix develop
cd ./fixtures
cargo run --release -p fluentci-engine -- serve
# Open the browser and go to http://localhost:6880/graphiql
# See ./fixtures for some GraphQL queries examples
```

> [!TIP]
> Quickly setup Nix on your machine with [DeterminateSystems Nix installer](https://github.com/DeterminateSystems/nix-installer)

## 📦 Downloads

Download **FluentCI Engine v0.6.1** for your platform:

- `Mac`: arm64: [fluentci-engine_v0.6.1_aarch64-apple-darwin.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_aarch64-apple-darwin.tar.gz) intel: [fluentci-engine_v0.6.1_x86_64-apple-darwin.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_x86_64-apple-darwin.tar.gz)
- `Linux`: intel: [fluentci-engine_v0.6.1_x86_64-unknown-linux-gnu.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_x86_64-unknown-linux-gnu.tar.gz) arm64: [fluentci-engine_v0.6.1_aarch64-unknown-linux-gnu.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_aarch64-unknown-linux-gnu.tar.gz)
- `FreeBSD`: x86_64: [fluentci-engine_v0.6.1_x86_64-unknown-freebsd.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_x86_64-unknown-freebsd.tar.gz)
- `NetBSD`: x86_64: [fluentci-engine_v0.6.1_x86_64-unknown-netbsd.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_x86_64-unknown-netbsd.tar.gz)
- `OpenBSD`: x86_64: [fluentci-engine_v0.6.1_x86_64-unknown-openbsd.tar.gz](https://github.com/fluentci-io/fluentci-engine/releases/download/v0.6.1/fluentci-engine_v0.6.1_x86_64-unknown-openbsd.tar.gz)

## 📚 Documentation

- [API Documentation](./docs/api.md)

## 🧩 Plugins

FluentCI Engine supports plugins in WebAssembly. You can write your own plugins in Rust or any other language that can compile to WebAssembly. See [examples](./examples) for more information.

### 🦀 Rust Plugin Example

Create a new Rust project:

```bash
cargo new nix --lib
```

Install the `extism_pdk`, `fluentci_types` and `fluentci_pdk` crates:

```bash
cargo add extism_pdk fluentci_types fluentci_pdk
```

Save the following code to `src/lib.rs`:

```rust
use extism_pdk::*;
use fluentci_pdk::dag;
use fluentci_types::nix::NixArgs;

#[plugin_fn]
pub fn exec(command: String) -> FnResult<String> {
    let stdout = dag()
        .nix(NixArgs {
            impure: true
        })?
        .with_exec(command.split_whitespace().collect())?
        .stdout()?;
    Ok(stdout)
}
```

Set the following in your `Cargo.toml`:

```toml
[lib]
crate-type = ["cdylib"]
```

Compile the plugin to WebAssembly:

```bash
cargo build --release --target wasm32-unknown-unknown
```

Run the plugin:

```bash
fluentci-engine call -m ./target/wasm32-unknown-unknown/release/nix.wasm -- exec nix --version
```

Source examples include [Python projects with uv](examples/uv) and
[native Rust builds with sccache](examples/sccache), including compiler-cache
statistics and supervised service cleanup.

### 📑 Available Plugins

- [android](https://github.com/fluent-ci-templates/android-pipeline/tree/main/plugin)
- [ansible-lint](https://github.com/tsirysndr/daggerverse/tree/main/ansible-lint/plugin)
- [ansible](https://github.com/tsirysndr/daggerverse/tree/main/ansible/plugin)
- [apko](https://github.com/fluentci-io/apko-plugin)
- [atlas](https://github.com/fluent-ci-templates/atlas-pipeline/tree/main/plugin)
- [base](https://github.com/fluent-ci-templates/base-pipeline/tree/main/plugin)
- [bazel](https://github.com/fluent-ci-templates/bazel-pipeline/tree/main/plugin)
- [biome](https://github.com/fluentci-io/biome-plugin)
- [black](https://github.com/tsirysndr/daggerverse/tree/main/black/plugin)
- [buf](https://github.com/fluent-ci-templates/buf-pipeline/tree/main/plugin)
- [buildx](https://github.com/tsirysndr/daggerverse/tree/main/buildx/plugin)
- [bun](https://github.com/fluent-ci-templates/bun-pipeline/tree/main/plugin)
- [checkmake](https://github.com/tsirysndr/daggerverse/tree/main/checkmake/plugin)
- [chromatic](https://github.com/fluent-ci-templates/chromatic-pipeline/tree/main/plugin)
- [clojure](https://github.com/fluent-ci-templates/clojure-pipeline/tree/main/plugin)
- [cloudflare](https://github.com/fluent-ci-templates/cloudflare-pipeline/tree/main/plugin)
- [codecov](https://github.com/fluent-ci-templates/codecov-pipeline/tree/main/plugin)
- [cue](https://github.com/fluentci-io/cue-plugin)
- [cypress](https://github.com/fluentci-io/cypress-plugin)
- [dagger](https://github.com/fluentci-io/dagger-plugin)
- [deno](https://github.com/fluent-ci-templates/deno-pipeline/tree/main/plugin)
- [depot](https://github.com/fluentci-io/depot-plugin)
- [dotnet](https://github.com/fluent-ci-templates/dotnet-pipeline/tree/main/plugin)
- [elixir](https://github.com/fluent-ci-templates/elixir-pipeline/tree/main/plugin)
- [fastlane](https://github.com/fluent-ci-templates/fastlane-pipeline/tree/main/plugin)
- [firebase](https://github.com/fluent-ci-templates/firebase-pipeline/tree/main/plugin)
- [flakestry](https://github.com/tsirysndr/daggerverse/tree/main/flakestry/plugin)
- [flipt](https://github.com/fluentci-io/flipt-plugin)
- [fly](https://github.com/fluent-ci-templates/fly-pipeline/tree/main/plugin)
- [flutter](https://github.com/fluent-ci-templates/flutter-pipeline/tree/main/plugin)
- [github](https://github.com/fluent-ci-templates/github-pipeline/tree/main/plugin)
- [gleam](https://github.com/fluent-ci-templates/gleam-pipeline/tree/main/plugin)
- [go](https://github.com/fluent-ci-templates/go-pipeline/tree/main/plugin)
- [gradle](https://github.com/fluent-ci-templates/gradle-pipeline/tree/main/plugin)
- [grype](https://github.com/fluent-ci-templates/grype-pipeline/tree/main/plugin)
- [heroku](https://github.com/fluent-ci-templates/heroku-pipeline/tree/main/plugin)
- [microcks](https://github.com/fluent-ci-templates/microcks-pipeline/tree/main/plugin)
- [netlify](https://github.com/fluent-ci-templates/netlify-pipeline/tree/main/plugin)
- [nixpacks](https://github.com/tsirysndr/daggerverse/tree/main/nixpacks/plugin)
- [nodejs](https://github.com/fluent-ci-templates/nodejs-pipeline/tree/main/plugin)
- [pkl](https://github.com/fluentci-io/pkl-plugin)
- [playwright](https://github.com/fluentci-io/playwright-plugin)
- [pulumi](https://github.com/fluent-ci-templates/pulumi-pipeline/tree/main/plugin)
- [oxc](https://github.com/fluentci-io/oxc-plugin)
- [railway](https://github.com/fluent-ci-templates/railway-pipeline/tree/main/plugin)
- [ruby](https://github.com/fluent-ci-templates/ruby-pipeline/tree/main/plugin)
- [ruff](https://github.com/fluentci-io/ruff-plugin)
- [rust](https://github.com/fluent-ci-templates/rust-pipeline/tree/main/plugin)
- [rye](https://github.com/fluentci-io/rye-plugin)
- [shuttle](https://github.com/fluent-ci-templates/shuttle-pipeline/tree/main/plugin)
- [sonar](https://github.com/fluent-ci-templates/sonar-pipeline/tree/main/plugin)
- [spin](https://github.com/fluent-ci-templates/spin-pipeline/tree/main/plugin)
- [ssh](https://github.com/fluentci-io/ssh-plugin)
- [supabase](https://github.com/fluent-ci-templates/supabase-pipeline/tree/main/plugin)
- [syft](https://github.com/fluent-ci-templates/syft-pipeline/tree/main/plugin)
- [symfony](https://github.com/fluent-ci-templates/symfony-pipeline/tree/main/plugin)
- [terraform](https://github.com/fluent-ci-templates/terraform-pipeline/tree/main/plugin)
- [zig](https://github.com/fluent-ci-templates/zig-pipeline/tree/main/plugin)
- [wasmer](https://github.com/fluent-ci-templates/wasmer-pipeline/tree/main/plugin)

### 🌈 Builtin functions

FluentCI Plugin Development Kit ([fluentci_pdk](https://docs.rs/fluentci-pdk/latest/fluentci_pdk)) provides some builtin functions from that you can use in your plugins:

#### devbox

Setup a Devbox Environment.

Example:

```rust
dag()
  .devbox()?
  .with_exec(vec!["devbox", "version"])?
  .stdout()?;
```

#### devenv

Setup a Devenv Environment.

Example:

```rust
dag()
  .devenv()?
  .with_exec(vec!["devenv", "version"])?
  .stdout()?;
```

#### directory

Load a directory at the given path.

Example:

```rust
dag()
  .directory(".")?
  .with_exec(vec!["ls", "-la"])?
  .stdout()?;
```

#### envhub

Setup an EnvHub Environment.

Example:

```rust
dag()
  .envhub()?
  .with_exec(vec!["envhub", "--version"])?
  .stdout()?;
```

#### file

Load a file at the given path.

Example:

```rust
dag()
  .file("Cargo.toml")?
  .path()?;
```

#### flox

Setup a Flox Environment.

Example:

```rust
dag()
  .flox()?
  .with_exec(vec!["flox", "--version"])?
  .stdout()?;
```

#### git

Load a Git repository at the given URL.

Example:

```rust
dag()
  .git("https://github.com/tsirysndr/me")?
  .branch("main")?
  .tree()?
  .entries()?;
```

#### http

Load a HTTP resource at the given URL.

Example:

```rust
dag()
  .http("https://example.com")?
  .path()?;
```

#### mise

Setup a Mise Environment.

Example:

```rust
dag()
  .mise()?
  .with_exec(vec!["mise", "--version"])?
  .stdout()?;
```

#### nix

Setup a Nix Environment.

Example:

```rust
dag()
  .nix(NixArgs {
    impure: true
  })?
  .with_exec(vec!["nix", "--version"])?
  .stdout()?;
```

#### pipeline

Create a new pipeline.

Example:

```rust
dag()
  .pipeline("example")?
  .with_exec(vec!["echo", "Hello, World!"])?
  .stdout()?;
```

#### pixi

Setup a Pixi Environment.

Example:

```rust
dag()
  .pixi()?
  .with_exec(vec!["pixi", "--version"])?
  .stdout()?;
```

#### pkgx

Setup a Pkgx Environment.

Example:

```rust
dag()
  .pkgx()?
  .with_exec(vec!["pkgx", "--version"])?
  .stdout()?;
```

## 🌱 Github Actions

FluentCI Engine is designed to be used with Github Actions. You can use the `fluentci-io/setup-fluentci@v5` action to run your pipelines. See [fluentci-io/setup-fluentci](https://github.com/marketplace/actions/setup-fluentci) for more information.

```yaml
name: Hello

on:
  push:
    branches:
      - main

jobs:
  setup-fluentci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup FluentCI
        uses: fluentci-io/setup-fluentci@v5
        with:
          wasm: true # set to true so WebAssembly plugins can be used
          plugin: base # Name of the Wasm Plugin to use without the .wasm extension,
          # will be downloaded from the registry https://pkg.fluentci.io

          # Arguments to pass to the plugin: function_name args
          args: |
            hello Hello, World!
```

Native plans also support [composable workflow primitives](docs/workflow-primitives.md):
retries, conditional tasks, bounded finalizers, named outputs and artifacts,
resource leases and supervised services (engine 0.6.1 or later and matching SDKs required).

See [native file and env-file primitives](docs/file-primitives.md) for filesystem tasks,
structured query results, and literal dotenv loading.

## ⚡ Caching

FluentCI Engine supports caching. To enable it, set the following environment variables:

- `FLUENTCI_CACHE_GCS_BUCKET` - GCS bucket name, if you are using Google Cloud Storage
- `FLUENTCI_CACHE_S3_ENDPOINT` - S3 endpoint, if you are using S3-compatible storage
- `FLUENTCI_CACHE_S3_BUCKET` - S3 bucket name, if you are using S3-compatible storage
- `FLUENTCI_CACHE_CDN_ENDPOINT` - CDN endpoint, if you are using CDN (optional) for downloading cache

> [!NOTE]
> You need to set `GOOGLE_APPLICATION_CREDENTIALS` or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables to use GCS or S3 cache.

## 🔭 OpenTelemetry Tracing

FluentCI Engine supports OpenTelemetry tracing. To enable it, set the `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_ZIPKIN_ENDPOINT` (if you want to use Zipkin) environment variable to the desired endpoint.

![jaeger](https://github.com/fluentci-io/fluentci-engine/raw/HEAD/.github/assets/jaeger.png)
![zipkin](https://github.com/fluentci-io/fluentci-engine/raw/HEAD/.github/assets/zipkin.png)
![honeycomb](https://github.com/fluentci-io/fluentci-engine/raw/HEAD/.github/assets/honeycomb.png)

## 📑 Logging

FluentCI Engine supports sending logs to [Baselime](https://baselime.io). To enable it, set the `BASELIME_API_KEY` environment variable to the desired API key.

![baselime](https://github.com/fluentci-io/fluentci-engine/raw/HEAD/.github/assets/baselime.png)

Independent host pipelines can also use the authenticated `serve-runs` API; see
the [server run API documentation](docs/host-executor.md#independent-server-runs).

Rust Wasm plugins use Extism and XTP schemas for the host ABI. See the
[plugin schema and code-generation guide](schema/README.md) for generating plugins
and running release-mode compatibility tests.

Native BSD archive targets, verification, and compiler availability are described
in the [BSD release guide](.github/BSD-RELEASES.md).
