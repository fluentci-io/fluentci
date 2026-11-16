---
title: "WebAssembly components"
description: "Create native WIT components alongside existing Extism modules."
section: "Guides"
url: "/guides/components/"
source: "guides/components.md"
---

# WebAssembly components

FluentCI supports two Wasm execution paths: existing Extism core modules and native
WebAssembly components. Components execute directly in Wasmtime with WASI Preview 2
and versioned WIT host imports. New SDK starters use components by default;
pass `--runtime extism` to create an Extism module. Existing manifests that omit
`runtime` retain their Extism behavior.
The runtime detects compiled artifacts by their binary encoding.

## Create a component module

```sh
fluentci init
# Or add another module to an existing project:
fluentci modules add deploy
```

All eight SDKs support component starters. Select a language explicitly:

```sh
fluentci modules add deploy --sdk purescript
fluentci modules add tools --sdk python
```

Component builds do not require Extism guest compilers. Rust and Elixir target
`wasm32-wasip2` using `wit-bindgen`; Python uses `componentize-py`; the JavaScript
language targets use ComponentizeJS. Generated WIT and bindings are build outputs,
not files developers must maintain.

```toml
[[modules]]
name = "main"
path = ".fluentci/main"
sdk = "rust"
runtime = "component"
```

An explicit `runtime = "component"` declaration rejects a core-Wasm artifact.
Existing modules without the field keep their current build behavior. Prebuilt
components can also be registered through `fluentci modules add` with `--path` or
`--url`, including components built by other language toolchains.

## Write typed functions, not duplicate WIT

Edit `src/jobs.rs`:

```rust
/// Greeting arguments.
pub struct HelloArgs {
    /// Name to greet.
    pub name: String,
}

/// Greet someone from a native component.
pub fn hello(args: HelloArgs) -> String {
    format!("Hello, {}!", args.name)
}
```

On every build, the inspection helper parses public job signatures and records,
generates WIT in Cargo's build output, and generates the native guest adapters.
Rust compiles the same functions used by those adapters. Keep record fields public
so adapters can construct them. Private helper functions are not exported.

Supported source types include owned scalars, concrete records, `Option`, `Vec`,
`Result`, and tuples. Unsupported or conditional declarations fail the build.
Source comments provide documentation; the generator does not invent descriptions
or infer behavior. Manual WIT remains available for custom interfaces.

## Automatic inspection in every SDK

| SDK           | Source of signatures                                                              | Component compiler             |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| Rust          | Parsed public functions and records in `src/jobs.rs`, checked by Rust compilation | `wit-bindgen`, `wasm32-wasip2` |
| TypeScript    | TypeScript compiler type checker, including inferred return types                 | ComponentizeJS                 |
| PureScript    | Fresh compiler `docs.json` and CoreFn exports                                     | ComponentizeJS                 |
| Gleam         | Fresh package interface and public record constructors                            | ComponentizeJS                 |
| ReScript      | Compiler documentation for exported signatures and fields                         | ComponentizeJS                 |
| ClojureScript | Typed Clojure signatures, validated before ClojureScript compilation              | ComponentizeJS                 |
| Python        | AST annotations, local dataclasses/TypedDicts, aliases and docstrings             | componentize-py                |
| Elixir        | The same compiled `defplugin` DSL declarations used to generate executable jobs   | Rust component guest           |

Every build regenerates WIT. Unsupported types, unresolved contracts, duplicate
WIT names, and untyped exports fail instead of generating guessed types. Python
needs explicit annotations; Elixir remains a CI DSL subset, not a general BEAM
compiler. JavaScript targets support concrete scalar/list/optional input fields;
return conversions support scalars, lists, and language-specific options/results.
Arbitrary classes, higher-order functions and promises are not exported.

Expose native return values from component functions. Extism `Host.outputString`,
`extism.output_str`, and raw `input()` calls are not component APIs. ClojureScript
initializes its compiled runtime lazily, after component instantiation, so compiler
snapshotting does not capture runtime random state. Elixir pipelines use the same
DSL implementation and return stdout, just like Extism guests. `run_plan` returns
the execution report; cache mounts remain available in both runtimes.

## Export functions by SDK

These rules apply to the default `runtime = "component"` starters. Each SDK guide
has a complete example that adds a `greet` job to an existing module:

| SDK                                                               | Define the function                                                               | Expose it to FluentCI                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Rust](/sdks/rust/#export-a-component-function)                   | A typed `pub fn` in `src/jobs.rs`                                                 | The generated adapters export public job functions. A `pub use` alone does not add a job.                                     |
| [TypeScript](/sdks/typescript/#export-a-component-function)       | A typed function in `entry.ts` or another source module                           | Add a named `export function` or `export { greet } from "./src/greetings"` to `entry.ts`.                                     |
| [PureScript](/sdks/purescript/#export-a-component-function)       | A typed function exported by its PureScript module                                | Re-export it from the compiled `output/<Module>/index.js` path in `entry.mjs`.                                                |
| [Gleam](/sdks/gleam/#export-a-component-function)                 | A typed `pub fn`, with public argument record constructors                        | Re-export it from the compiled Gleam module's `.mjs` path in `entry.mjs`.                                                     |
| [ReScript](/sdks/rescript/#export-a-component-function)           | A typed public binding, also exposed by `.resi` if present                        | Re-export it from the generated `.res.mjs` file in `entry.mjs`.                                                               |
| [ClojureScript](/sdks/clojurescript/#export-a-component-function) | A typed `defn` in `src/main/plugin.cljc`                                          | Add it to `src/main/entry.cljs`'s export map and expose a named wrapper in `entry.mjs`. Keep the component invocation bridge. |
| [Python](/sdks/python/#export-a-component-function)               | A top-level function with explicit argument and return annotations in `plugin.py` | Functions without an underscore prefix are inspected automatically. No Extism decorator is needed.                            |
| [Elixir](/sdks/elixir/#export-a-component-function)               | A `defplugin` declaration in the module selected by `entry`                       | The DSL generates the export, argument metadata, and Rust component implementation. An ordinary `def` alone is not a job.     |

For JavaScript-based SDKs, being public in the source language is not enough:
the function must also appear in the inspected `entry.ts` or `entry.mjs` export
surface. Keep existing exports when adding a job, and keep helper functions off
that surface. Rust and Python inspect their configured source directly; Elixir
uses its `defplugin` declarations.

WIT uses kebab-case identifiers. For example, a source field `source_dir` becomes
`source-dir` in WIT and `--source-dir` in the CLI; generated adapters convert it back
to the language's native field name.

```sh
fluentci modules main --json
fluentci run main --help
fluentci run main greet --help
fluentci run main greet --name Tsiry
```

Use your workspace alias instead of `main` if it differs. These commands build
the module as needed. If a function is missing from help or JSON discovery,
check its source visibility, typed signature, and entrypoint exports before
publishing. The standard build regenerates WIT and metadata; do not maintain a
second export list in handwritten WIT or `imports.d.ts` for a component starter.

The CLI derives parameter names, types, and return types from the compiled
component's WIT surface without instantiating it. A single record parameter is
exposed as flags for its fields. Other parameters become flags with their WIT
names. Booleans accept bare switches; lists, records, tuples, variants, and flags
use JSON values. Integer ranges follow their WIT type, including unsigned and
64-bit integers. Optional values may be omitted.

Functions exported through interfaces can be invoked by their unique short name.
When names collide, use `interface-name#function-name`. Resource methods and
resource handles are not standalone CLI jobs.

## FluentCI host capabilities

The SDK supplies the **`fluentci:runtime@0.1.0`** package. Its version remains
`0.1.0`; the original `host` interface is preserved and the new `api` interface
provides all 53 existing SDK host operations through typed WIT imports.

Both runtimes call the same native implementation for:

- Pipelines, command execution, working directories, stdout and stderr.
- Files, directories, archive operations, hashes, HTTP downloads and Git.
- Environment variables, caches, secrets and secret providers.
- Services and readiness waits; Nix, Devbox, Devenv, Flox, Pkgx, Mise,
  Pixi, Hermit, Proto and Envhub environments.
- Nested module calls and native DAG execution, including file operations,
  service lifecycle, resource limits, packages and remote primitives such as rsync.

The `api.execute-plan` operation accepts a WIT `plan` record and returns a typed
`run-result`. Task variants, service probes, cache policies and primitives come
from the real executor declarations. The generator and drift checks keep them
synchronized. Dynamic JSON fields remain explicitly encoded strings; whole plans
and reports do not cross this interface as JSON strings.

Existing SDK pipelines work in components without rewriting their host calls.
JavaScript and Python guest adapters translate their SDK values to typed imports.
Rust and Elixir use a generated `fluentci-pdk` transport with no Extism dependency.
Module developers continue maintaining their source functions; builds supply WIT
and bindings automatically.

The original `host` interface still supplies `get-env`, `log` and the legacy JSON
`execute-plan` operation for existing components. Native execution preserves
structured diagnostics, and cancellation propagates to the executor and component.

WASI exposes invocation environment variables, standard streams, and the current
project directory. This initial runtime targets synchronous WASI Preview 2
components; asynchronous WIT and CLI resource-handle arguments are not supported.

## Publishing and migration

Publishing uses the existing registry, immutable download URL, checksum, version,
and lockfile rules. The registry accepts component binaries as well as core Wasm.
Component function metadata uses `inputFormat: "wit"`; signatures come from WIT
and cannot be replaced by a conflicting metadata manifest. Help and the landing
page's Docs tab display that interface.

An Extism artifact is not a component and cannot be converted by changing the
runtime setting. Rebuild source against a component toolchain and publish a new
version. Existing Extism SDKs, host calls, and published modules remain supported
during the migration.
