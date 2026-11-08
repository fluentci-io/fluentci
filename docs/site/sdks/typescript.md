---
title: "TypeScript"
description: "Bundle familiar TypeScript builders into reusable Wasm plugin jobs."
section: "Language SDKs"
url: "/sdks/typescript/"
source: "sdks/typescript.md"
---

## Default component starter

```sh
fluentci init --sdk typescript
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
fluentci init --sdk typescript --runtime extism
# Or add to an existing workspace:
fluentci modules add ci --sdk typescript --runtime extism
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `entry.ts`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```typescript
import { dag } from "./.sdk/typescript/src/plugin.ts";

export function hello() {
  const output = dag
    .pipeline("hello")
    .withExec(["echo", "Hello from FluentCI"])
    .withExec(["git", "status", "--short"])
    .stdout();

  Host.outputString(output);
}
```

Chain .withExec() calls; .stdout() executes the steps in order.

## Toolchain and build

Install Node/npm and extism-js. The starter bundles its SDK under
`.sdk/typescript`. `npm run build` uses esbuild to bundle `entry.ts` as CommonJS,
then invokes extism-js with the guest interface declaration.

The example's `withExec` calls use argv arrays. `stdout()` executes the composed
pipeline and returns its output, which is written with `Host.outputString`.
An SDK's process builder does not use a Node subprocess API inside the guest.

## Wasm exports and legacy pipelines

Each exported job needs a matching declaration in `imports.d.ts`. Rebuild before
inspecting functions with `fluentci modules main --json`.

This SDK targets a Wasm plugin. It is different from the CLI's legacy
TypeScript/Dagger pipeline compatibility path, which uses Deno/Dagger runtimes.
An `entry.ts` source plugin does not imply Deno is embedded into the Wasm guest.

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
