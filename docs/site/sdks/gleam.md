---
title: "Gleam"
description: "Use value-first pipes and Result-based errors in a JavaScript-targeting guest SDK."
section: "Language SDKs"
url: "/sdks/gleam/"
source: "sdks/gleam.md"
---

## Default component starter

```sh
fluentci init --sdk gleam
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
fluentci init --sdk gleam --runtime extism
# Or add to an existing workspace:
fluentci modules add ci --sdk gleam --runtime extism
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
