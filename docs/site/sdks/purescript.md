---
title: "PureScript"
description: "Compose typed functions with # and handle host errors explicitly."
section: "Language SDKs"
url: "/sdks/purescript/"
source: "sdks/purescript.md"
---

## Create a module

```sh
fluentci init --sdk purescript
# Or add to an existing workspace:
fluentci modules add ci --sdk purescript
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
