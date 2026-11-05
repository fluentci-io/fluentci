---
title: "Gleam"
description: "Use value-first pipes and Result-based errors in a JavaScript-targeting guest SDK."
section: "Language SDKs"
url: "/sdks/gleam/"
source: "sdks/gleam.md"
---

## Create a module

```sh
fluentci init --sdk gleam
# Or add to an existing workspace:
fluentci modules add ci --sdk gleam
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `src/plugin.gleam`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```gleam
import fluentci/plugin

pub fn hello() -> Result(String, String) {
  plugin.pipeline("hello")
  |> plugin.exec("echo", ["Hello from FluentCI"])
  |> plugin.exec("git", ["status", "--short"])
  |> plugin.stdout
}
```

The |> operator pipes each result into the next function.

## Toolchain and build

Install Node/npm, Gleam, and extism-js. The generated `gleam.toml` targets
JavaScript and depends on the bundled `.sdk/gleam` package. `npm run build`
compiles Gleam, bundles JavaScript with esbuild, and compiles the Wasm artifact.

The `|>` operator passes the pipeline into each operation. The terminal function
returns a `Result`; the starter's JavaScript wrapper turns an `Error` into an
execution failure and writes successful output to the guest response.

## Export alignment

`entry.mjs` imports the compiled `hello` from the generated Gleam module path.
That path contains the Gleam package name from `gleam.toml`; changing it requires
updating the wrapper. Add matching Wasm export declarations in `imports.d.ts`
when exposing more jobs.

The registry server is also written in Gleam, but it targets Node.js as a normal
server application. It is separate from this guest SDK and its Wasm compilation.

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
