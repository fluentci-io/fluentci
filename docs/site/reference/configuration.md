---
title: "fluentci.toml"
description: "Configure local modules, registry packages, Git monorepos, publishing metadata, and pipeline steps."
section: "Reference"
url: "/reference/configuration/"
source: "reference/configuration.md"
---

## File discovery

The CLI checks `fluentci.toml` and `.fluentci/fluentci.toml` while walking ancestor
directories, respecting Git boundaries. Prefer one root file. Local module paths
resolve relative to the configuration file. `fluentci.lock` belongs at the workspace
root, alongside the root configuration; commit it for reproducible dependencies.

A configuration file is optional for [direct registry or URL invocation](/registry/using-plugins/).

## Complete example

```toml
[[modules]]
name = "ci"
path = ".fluentci/ci"
sdk = "purescript"
version = "1.0.0"
description = "Reusable build checks"
license = "MIT"
repository = "https://github.com/example/pipelines.git"
subdir = "modules/ci"

[[modules.functions]]
name = "check"
args = [{ name = "arguments", type = "Array String" }]
returnType = "String"

[[modules]]
name = "sccache"
package = "@tsiry-sandratraina.com/sccache@v0.1.0"

[[modules]]
name = "git-checks"
git = "https://github.com/example/pipelines.git"
rev = "main"
subdir = "modules/checks"
sdk = "purescript"

[[modules]]
name = "downloaded"
url = "https://plugins.example/build.wasm"

[[steps]]
name = "check"
command = "fluentci run ci check"
env = ["BUILD_MODE=release"]
working_directory = "."
```

Each module selects exactly one source: `path`, `url`, `package`, or `git`.
`steps` and `modules` default to empty lists. Publishing metadata is per module
and is optional for local execution.

## Module fields

| Field         | Type                     | Contract                                                                                                                                            |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string                   | Unique local invocation name; letters, digits, `-`, `_`; `shell` is reserved. A qualified registry reference can also be used directly as the name. |
| `path`        | string                   | Local source directory, `.wasm` file, or Rust `Cargo.toml`.                                                                                         |
| `url`         | string                   | HTTP(S) URL whose path ends in `.wasm`; query parameters are allowed.                                                                               |
| `package`     | string                   | Registry source: `@handle/module`, `@handle/module@latest`, or `@handle/module@v1.0.0`. Bare SemVer is also accepted.                               |
| `git`         | string                   | Git source repository URL: HTTPS, HTTP, `ssh://`, or `git://`.                                                                                      |
| `rev`         | optional string          | Git branch, tag, or commit. Defaults to `HEAD`; the lockfile pins the resolved commit. Requires `git`.                                              |
| `subdir`      | optional string          | Module directory inside `git` or `repository`. Must be relative and cannot contain `..`.                                                            |
| `repository`  | optional string          | Published source repository URL; metadata rather than a source selector. Defaults to `git` when publishing a Git module.                            |
| `sdk`         | string                   | Source compiler SDK; defaults to `rust`. Precompiled and registry modules do not require an SDK build.                                              |
| `entry`       | optional string          | Elixir module or Python entry file. Required for source Elixir without a custom build.                                                              |
| `artifact`    | optional string          | Build output relative to the source directory; JavaScript SDKs default to `dist/plugin.wasm`.                                                       |
| `build`       | optional string array    | Executable and literal arguments for a custom build; not a shell command string.                                                                    |
| `version`     | optional string          | This module's publishing SemVer. Never inherited from `package.version`.                                                                            |
| `description` | optional string          | Published description; optional and skippable at publishing prompts.                                                                                |
| `license`     | optional string          | Required non-empty license for publishing; the prompt suggests common SPDX identifiers.                                                             |
| `functions`   | optional array of tables | Export descriptions and source-level argument/return types for publishing.                                                                          |

Unknown fields are rejected. Registry sources cannot override `build`, `entry`,
or `artifact`; URL sources cannot override `build` or `artifact`. Rust normally
resolves artifacts through Cargo; artifact overrides require a custom build.

## Registry aliases and versions

```toml
[[modules]]
name = "sccache"
package = "@tsiry-sandratraina.com/sccache"
```

Run `fluentci run sccache build ...`. Omitting the version is equivalent to
`@latest`: the initial resolution chooses the newest stable SemVer, falling back
to prereleases only when no stable release exists. Subsequent runs use the locked
release until `fluentci update sccache`. A `v` prefix is accepted for exact versions.
Use the publisher's complete AT Protocol handle, including its domain.

A reference can also be declared without a separate alias:

```toml
[[modules]]
name = "@tsiry-sandratraina.com/sccache@v0.1.0"
```

See [fluentci.lock](/reference/lockfile/) for install, update, and frozen CI runs.

## Git monorepos and documentation

`git` selects a source repository, while `subdir` selects the module inside it.
The CLI checks out the pinned commit and runs the selected SDK build inside that
subdirectory. Different module declarations can share a repository and choose
different directories. Absolute paths, parent traversal, and symlink escapes are
rejected.

`fluentci docs git-checks` renders the module's `README.md` using `glow` at the
locked commit. Published plugins use `repository` plus `subdir` to locate their
README. If no README is available, the command reports that fact.

## Function metadata

```toml
[[modules.functions]]
name = "build"
description = "Build a project"
args = [{ name = "arguments", type = "Array String" }]
returnType = "String"
```

Declarations attach to the preceding module. Each argument requires `name` and
`type`; descriptions are optional. `args` and `returnType` are optional: omission
means unknown, while `args = []` explicitly means no arguments. This format works
with every SDK. Publishing checks function names against Wasm exports and derives
`wasmParams` and `wasmResults` from the actual binary. An optional JSON manifest
or embedded `fluentci:metadata` section can supply the same declarations.

## Publishing metadata

Only name, version, and license are required. The CLI prompts for missing values
in an interactive terminal; non-interactive runs must supply them through module
configuration or flags. `--name`, `--version`, `--description`, `--license`,
`--repository`, and `--subdir` override the selected module's metadata without
rewriting the configuration. File and URL publishing require an explicit name
flag or prompt. See [publishing](/registry/publishing/).

## Step fields

| Field               | Type                   | Contract                                                          |
| ------------------- | ---------------------- | ----------------------------------------------------------------- |
| `name`              | string                 | Step display and invocation name.                                 |
| `command`           | string or string array | Shell commands or calls such as `fluentci run sccache build ...`. |
| `env`               | optional string array  | Environment assignments, such as `MODE=release`.                  |
| `working_directory` | optional string        | Working directory for the step.                                   |

Command arrays run sequentially. Use [native plans](/guides/native-plans/) for
explicit task dependencies, parallelism, and matrices.
