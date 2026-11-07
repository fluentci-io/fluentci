---
title: "Elixir"
description: "Write pipelines with the supported Elixir DSL and generate a Rust/Wasm plugin."
section: "Language SDKs"
url: "/sdks/elixir/"
source: "sdks/elixir.md"
---

## Create a module

```sh
fluentci init --sdk elixir
# Or add to an existing workspace:
fluentci modules add ci --sdk elixir
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `lib/main.ex`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```elixir
defmodule Main do
  use FluentCI.Plugin

  defplugin hello do
    pipeline("hello")
    |> exec(["echo", "Hello from FluentCI"])
    |> exec(["git", "status", "--short"])
    |> stdout()
  end
end
```

The |> operator composes steps; defplugin exports the job to Wasm.

## Toolchain and build

Install Elixir/Mix, Cargo, rustc, and rustup. The starter uses a local
`.sdk/elixir` dependency. The CLI sets up the Wasm target, fetches Mix dependencies,
and runs `mix fluentci.plugin.build ENTRY --output dist/plugin.wasm`.

Elixir modules require `entry = "Main"` (or the actual plugin module) in the
module declaration. This entry identifies the DSL module rather than a filename.

## Guest semantics

`use FluentCI.Plugin` and `defplugin` define exported jobs. The SDK translates
its supported pipeline DSL into a generated Rust/Wasm plugin; it does not put a
BEAM runtime inside Wasm or support arbitrary Elixir runtime behavior.

The starter initially returns a greeting. The sample above demonstrates the
supported pipeline and `|>` composition. Keep reusable logic within the DSL's
supported surface and consult the SDK source when adding features.

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
