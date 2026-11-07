---
title: "ReScript"
description: "Compose typed builders and handle result values before returning guest output."
section: "Language SDKs"
url: "/sdks/rescript/"
source: "sdks/rescript.md"
---

## Create a module

```sh
fluentci init --sdk rescript
# Or add to an existing workspace:
fluentci modules add ci --sdk rescript
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `src/Greeting.res`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```rescript
@val @scope("Host")
external output: string => unit = "outputString"

let hello = () => {
  switch Guest.pipeline("hello")
    ->Guest.exec(["echo", "Hello from FluentCI"])
    ->Guest.exec(["git", "status", "--short"])
    ->Guest.stdout {
  | Ok(value) => output(value)
  | Error(message) => JsError.throwWithMessage(message)
  }
}
```

The -> operator pipes the pipeline into the first argument of the next function.

## Toolchain and build

Install Node/npm and extism-js. The starter pins ReScript and the matching runtime
in `package.json`; the compiler can be found in `node_modules/.bin`. Its SDK is
bundled as a local `.sdk/rescript` dependency.

`npm run build` compiles ReScript, bundles the generated JavaScript with esbuild,
and creates Wasm with extism-js. The `->` operator passes a value as the first
argument to the next function.

## Results and exports

Handle both `Ok` and `Error` from terminal operations. The example writes
successful output through `Host.outputString` and throws on failure.
`entry.mjs` exposes `hello` from `src/Greeting.res.mjs`; the Wasm interface
file must declare each exported job too.

The generated `.res.mjs` files are build output, not a substitute for the source
and dependency lockfiles. Rebuild after SDK or compiler changes.

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
