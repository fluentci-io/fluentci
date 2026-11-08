---
title: "PureScript"
description: "Compose typed functions with # and handle host errors explicitly."
section: "Language SDKs"
url: "/sdks/purescript/"
source: "sdks/purescript.md"
---

## Default component starter

```sh
fluentci init --sdk purescript
fluentci run main hello --name FluentCI
```

New modules use native Wasm components. Source signatures generate WIT, typed
arguments, return types, and help during the build. See [WebAssembly components](/guides/components/)
for the component toolchain and host API. Use `fluentci run main hello --help`
to inspect the generated signature.

The examples below use the Extism runtime explicitly in a fresh workspace.
Both runtimes remain supported.

## Create a module

```sh
fluentci init --sdk purescript --runtime extism
# Or add to an existing workspace:
fluentci modules add ci --sdk purescript --runtime extism
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `src/Main.purs`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```purescript
module Main where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P

hello :: Effect Unit
hello = do
  result <- P.pipeline "hello"
    # P.exec ["echo", "Hello from FluentCI"]
    # P.exec ["git", "status", "--short"]
    # P.stdout
  case result of
    Left error -> throw (P.errorMessage error)
    Right output -> void (P.output output)
```

The # operator passes the pipeline into the next step.

## Toolchain and build

Install Node/npm, PureScript (`purs`), Spago, and extism-js. Spago configuration
pins the SDK dependency in the generated starter. `npm run build` executes Spago,
bundles the generated JavaScript with esbuild, and compiles Wasm with extism-js.

The `#` operator passes the pipeline into the next builder. `stdout` is a terminal
operation returning an `Either`: propagate a failed host operation rather than
silently discarding `Left`. The example writes successful output through the
SDK's guest output operation.

## Export a job

`entry.mjs` re-exports `hello` from the compiled PureScript module. The Wasm
interface declaration in `imports.d.ts` also lists that export. When adding
`build`, export it in PureScript, expose it in the wrapper, and declare it in the
interface before rebuilding.

The generated module's npm package name can differ from its PureScript module
name. Keep imports and the wrapper aligned with the actual compiled path.
This repository's own CI and desktop release automation use PureScript Wasm
modules under `.fluentci/`.

## Run and inspect

```sh
fluentci run main hello
fluentci modules main --json
```

Use the configured module name instead of `main` if it was added as `ci`.
CLI invocation builds the source module before running it. The resulting artifact
is normally `dist/plugin.wasm`.

Continue with [workspace modules](/guides/modules/) for custom builds and artifact
paths, or [publishing](/registry/publishing/) to share the compiled plugin.

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
