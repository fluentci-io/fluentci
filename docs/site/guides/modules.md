---
title: "Workspace modules"
description: "Declare local source, precompiled Wasm, and URL modules without duplicating monorepo configuration."
section: "Build pipelines"
url: "/guides/modules/"
source: "guides/modules.md"
---

## Declare modules

```toml
[[modules]]
name = "ci"
path = ".fluentci/ci"
sdk = "clojurescript"

[[modules]]
name = "prebuilt"
path = "artifacts/plugin.wasm"

[[modules]]
name = "shared"
url = "https://example.com/plugins/shared.wasm"
```

Names must be unique. Each declaration needs exactly one of `path` or `url`.
SDK defaults to Rust. Precompiled paths do not need a language compiler to rebuild
the artifact. URL modules cannot specify a build command or artifact override.

## Scaffold or register

```sh
fluentci modules add ci --sdk clojurescript
fluentci modules add checks --path ./tools/checks --sdk purescript
fluentci modules add shared --url https://example.com/plugins/shared.wasm
```

Scaffolding embeds source and updates configuration. Registration uses an
existing location. Duplicate names and unsafe names are rejected; existing
source is not silently replaced.

## Override the build

```toml
[[modules]]
name = "custom"
path = "tools/custom-plugin"
sdk = "typescript"
build = ["npm", "run", "build:plugin"]
artifact = "output/custom.wasm"
```

`build` is an argv array: its first element is the executable, not a shell
program string. The artifact path resolves inside the source module directory.
JavaScript SDK defaults use `dist/plugin.wasm`. Rust artifacts are resolved
through Cargo unless a custom build is configured.

## Discover exports

```sh
fluentci modules --json
fluentci modules ci --json
fluentci inspect ci --json
fluentci ls ci
```

Discovery builds source modules when necessary, then lists exported jobs. Compiler
helper exports are hidden. JSON output includes module paths, SDKs, and functions;
build diagnostics stay out of the JSON payload.

## Run from a package

```sh
cd packages/frontend
fluentci run ci hello
```

The root declaration continues to work. Relative paths belong to the config
file. With multiple modules, select a name explicitly instead of relying on an
ambiguous `.` selection. See [configuration reference](/reference/configuration/).
