---
title: "Rust"
description: "Build a Wasm cdylib with typed Rust functions and Extism PDK exports."
section: "Language SDKs"
url: "/sdks/rust/"
source: "sdks/rust.md"
---

## Default component starter

```sh
fluentci init --sdk rust
fluentci run main hello --name FluentCI
```

New modules use native Wasm components. Source signatures generate WIT, typed
arguments, return types, and help during the build. See [WebAssembly components](/guides/components/)
for the component toolchain and host API. Use `fluentci run main hello --help`
to inspect the generated signature.

The examples below use the Extism runtime explicitly in a fresh workspace.
Both runtimes remain supported.

## Scaffold

```sh
fluentci init --runtime extism
# Or select explicitly:
fluentci modules add ci --sdk rust --runtime extism
```

Rust is the default SDK. The generated `Cargo.toml` creates a `cdylib` and pins
`extism-pdk`. Its `[workspace]` keeps the starter independent from an enclosing
Cargo workspace unless deliberately integrated.

## Minimal export

```rust
use extism_pdk::*;

#[plugin_fn]
pub fn hello() -> FnResult<String> {
    Ok("Hello from FluentCI".into())
}
```

The macro exposes `hello` as a plugin job. This minimal example needs no separate
JavaScript export wrapper. Returning `Err` communicates a failed invocation.

## Build and run

Install Cargo, rustc, rustup, and the Wasm target:

```sh
rustup target add wasm32-unknown-unknown
fluentci run main hello
fluentci modules main --json
```

The CLI builds the selected Cargo library for Wasm in release mode and resolves
the library's artifact name from Cargo metadata. In a multi-package Cargo
workspace it selects the requested module instead of treating every package as
one plugin. Custom artifact overrides require an explicit build command.

## Engine SDK operations

`extism-pdk` provides guest input/output and export machinery. Host pipeline
operations additionally use the engine's Rust PDK/types APIs; add the dependencies
needed by that SDK rather than expecting all host functions from the minimal
starter dependency. See the
[engine Rust examples](https://github.com/fluentci-io/fluentci-engine/tree/main/examples)
for pipeline and native-plan integration.

A Rust plugin and the Rust CLI are separate build targets. Rebuilding a guest
module does not require rebuilding Studio; compiling the CLI itself does.

## Host and transfer tasks

The bundled SDK includes composable OS/architecture detection, SHA-256/SHA-512,
SSH, SCP, SFTP, rsync, FTP/FTPS, and S3 tasks. See the
[primitive guide](/guides/primitives/) for this SDK’s entry point and example,
plus provisioning, credential, cancellation, and caching behavior.

## Typed named arguments

This SDK uses the shared [typed module arguments contract](/guides/module-arguments/).
New SDK starters derive typed function and argument metadata during their build.
Custom toolchains can register a contract in `fluentci.metadata.json` or
`fluentci.toml`, opt into `inputFormat: "json"`, and decode the typed guest input
with this language’s JSON facilities. `fluentci modules embed` makes an artifact
self-describing for direct file/URL calls and `--help`.
