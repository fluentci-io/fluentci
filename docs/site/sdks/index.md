---
title: "Choose an SDK"
description: "Use one plugin runtime with language-specific composition, type checking, and error handling."
section: "Language SDKs"
url: "/sdks/"
source: "sdks/index.md"
---

## One runtime, different source languages

A source module is compiled to Wasm before the CLI invokes its jobs. Choose a
language for its composition and tooling model; the guest runtime still calls
host commands through the engine. SDK coverage and exact API names differ.

| SDK           | Selector        | Composition                                  | Default source entry   |
| ------------- | --------------- | -------------------------------------------- | ---------------------- |
| ClojureScript | `clojurescript` | Immutable tagged maps, `->`, checked `.cljc` | `src/main/plugin.cljc` |
| PureScript    | `purescript`    | Typed functions, `#`, `Either`               | `src/Main.purs`        |
| Rust          | `rust`          | Rust functions and Extism PDK exports        | `src/lib.rs`           |
| TypeScript    | `typescript`    | Fluent builders and argv arrays              | `entry.ts`             |
| Python        | `python`        | Decorated exports and chained builders       | `plugin.py`            |
| Gleam         | `gleam`         | `                                            | >`and`Result`          | `src/plugin.gleam` |
| Elixir        | `elixir`        | `defplugin` DSL and `                        | >`                     | `lib/main.ex`      |
| ReScript      | `rescript`      | Typed builders, `->`, `result`               | `src/Greeting.res`     |

## Scaffold a module

```sh
fluentci init --sdk clojurescript
fluentci modules add checks --sdk purescript
```

`init` creates a workspace configuration and starter module. `modules add`
extends an existing workspace. `init --standalone --sdk SDK` creates a reusable
package in the current directory instead. Existing files are preserved.

## Build and run

```sh
fluentci run main hello
fluentci modules main --json
```

The CLI selects the module's SDK build pipeline and verifies its artifact. Source
builds need compiler tools even during discovery. An existing `.wasm` module can
be run without rebuilding that source, but its host commands still need their
dependencies.

JavaScript-targeting SDKs use esbuild and extism-js to package exports. Python
uses its Extism Python build path. Elixir generates a Rust/Wasm plugin rather
than embedding a BEAM VM. Rust builds a `cdylib` for the Wasm target in release
mode.

## Keep export layers aligned

When adding a job, update the language export and any JavaScript or interface
wrapper used by that starter. An ordinary helper function is not necessarily a
Wasm export. Check `fluentci modules MODULE --json` after rebuilding.

Each guide below shows a pipeline sample and the corresponding starter's build
requirements. Some starters initially print only a greeting; replace their
source with the sample when following a guide.
