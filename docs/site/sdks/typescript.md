---
title: "TypeScript"
description: "Bundle familiar TypeScript builders into reusable Wasm plugin jobs."
section: "Language SDKs"
url: "/sdks/typescript/"
source: "sdks/typescript.md"
---

## Create a module

```sh
fluentci init --sdk typescript
# Or add to an existing workspace:
fluentci modules add ci --sdk typescript
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
