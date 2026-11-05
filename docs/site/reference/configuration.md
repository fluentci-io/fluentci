---
title: "fluentci.toml"
description: "Field-level configuration for modules, ordered steps, and package metadata."
section: "Reference"
url: "/reference/configuration/"
source: "reference/configuration.md"
---

## File discovery

The CLI checks `fluentci.toml` and `.fluentci/fluentci.toml` while walking ancestor
directories. Workspace discovery respects Git boundaries and recognizes common
monorepo manifests. Prefer one root file. Paths in module declarations resolve
relative to the actual configuration file, including the legacy `.fluentci`
location.

## Complete example

```toml
[[modules]]
name = "ci"
path = ".fluentci/ci"
sdk = "clojurescript"
version = "1.0.0"
description = "Reusable build checks"
license = "MIT"

[[modules]]
name = "downloaded"
url = "https://plugins.example/build.wasm"

[[steps]]
name = "check"
command = "fluentci run ci hello"
env = ["BUILD_MODE=release"]
working_directory = "."
```

Publishing metadata belongs to each `[[modules]]` entry and is optional for local runs.
Both `steps` and `modules` default to empty lists when omitted.

## Module fields

| Field         | Type                     | Contract                                                                                                    |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `name`        | string                   | Required and unique; ASCII letters, digits, `-`, `_`; `shell` is reserved                                   |
| `functions`   | optional array of tables | Job metadata: `name`, optional `args`, `returnType`, `description`; see [publishing](/registry/publishing/) |
| `version`     | optional string          | SemVer version for publishing                                                                               |
| `description` | optional string          | Published package description                                                                               |
| `license`     | optional string          | Required non-empty license when publishing                                                                  |
| `path`        | path string              | Source directory, local `.wasm`, or Rust manifest; exactly one of `path`/`url`                              |
| `url`         | string                   | HTTP(S) URL whose path ends in `.wasm`; URL modules cannot override build/artifact                          |
| `sdk`         | string                   | Defaults to `rust`; see [SDK selectors](/sdks/)                                                             |
| `entry`       | string                   | Required for source Elixir without custom build; Python entry defaults to `plugin.py`                       |
| `artifact`    | path string              | Output relative to source; JavaScript SDK default is `dist/plugin.wasm`                                     |
| `build`       | array of strings         | Executable and literal arguments; must not be empty                                                         |

Module declarations reject unknown fields. Rust artifacts normally resolve from
Cargo metadata; a Rust artifact override requires an explicit build command.
Precompiled module paths skip source compilation. Unlike publishing's `--url`,
module URL validation permits query parameters on a `.wasm` path.

## Step fields

| Field               | Type                   | Contract                                                             |
| ------------------- | ---------------------- | -------------------------------------------------------------------- |
| `name`              | string                 | Step's display/invocation name                                       |
| `command`           | string or string array | Shell commands, or a module job call such as `fluentci run ci hello` |
| `env`               | optional string array  | Environment assignments such as `MODE=release`                       |
| `working_directory` | optional string        | Command execution directory                                          |

A command array belongs to one step; it is not a native parallel task matrix.
Use [native plans](/guides/native-plans/) for explicit graph dependencies and
parallelism.

## Publishing metadata

Each module’s `name` and `version` identify its published package. `description` and `license` provide
published metadata; the publish command requires a non-empty license. Name,
version, description, Wasm URL, and size limits are documented in
[publishing](/registry/publishing/). The publisher's canonical DID comes from the
authenticated session, not a user-entered author field in TOML.
