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
| `readme_url`  | optional string          | Public HTTP(S) README URL without credentials; published as `readmeUrl` and preferred by `fluentci docs`.                                           |
| `topics`      | optional string array    | Up to 20 distinct lowercase topic labels, each at most 50 characters.                                                                               |
| `os`          | optional string array    | Up to 16 supported host OS labels, such as `linux`, `macos`, or `freebsd`. Omitted means unspecified.                                               |
| `arch`        | optional string array    | Up to 16 supported CPU architecture labels, such as `x86_64` or `aarch64`. Omitted means unspecified.                                               |
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
`--repository`, `--subdir`, `--topic`, `--os`, `--arch`, and `--readme-url`
override the selected module's metadata without
rewriting the configuration. File and URL publishing require an explicit name
flag or prompt. See [publishing](/registry/publishing/).

Interactive publishing prompts for missing optional classification and README
fields too. Enter skips an optional field; Tab completes topics, OS labels, and
CPU architectures. Comma-separated inputs select multiple values.

## Step fields

| Field               | Type                   | Contract                                                          |
| ------------------- | ---------------------- | ----------------------------------------------------------------- |
| `name`              | string                 | Step display and invocation name.                                 |
| `command`           | string or string array | Shell commands or calls such as `fluentci run sccache build ...`. |
| `env`               | optional string array  | Environment assignments, such as `MODE=release`.                  |
| `working_directory` | optional string        | Working directory for the step.                                   |

Command arrays run sequentially. Use [native plans](/guides/native-plans/) for
explicit task dependencies, parallelism, and matrices.

## Service definitions

`[[services]]` declares persistent or CI-scoped background programs alongside
modules and steps. The `services` array defaults to empty. Definitions support
`name`, `command`, `backend`, `working_directory`, `env`, `depends_on`, `setup`,
`readiness`, `health`, `restart`, `max_restarts`, `restart_backoff_ms`,
`startup_timeout_ms`, `stop_timeout_ms`, and `log_max_bytes`. Nix/pkgx use
`packages`; Nix can also use `flake`. Docker uses `image`, `ports`, and `volumes`.

Commands are literal argv arrays or explicit POSIX shell strings. See the
[services guide](/guides/services/) for database examples, environment backends,
Docker port allocation, scoped CI commands, and definitions supplied from code.

## Multiple workflows

Store named workflows in `.fluentci/workflows/*.toml`. Keep shared module and
service declarations in the root `fluentci.toml`; workflow steps resolve module
names and working directories against that project root.

```toml
# .fluentci/workflows/ci.toml
id = "ci"
name = "Continuous integration"
description = "Build and test the workspace"
enabled = true
env = ["CI=true"]

[[steps]]
name = "Build"
module = "main"
command = "build"
wasm = true

[[steps]]
name = "Tests"
module = "main"
command = "test"
working_directory = "."
```

`id` is a unique, stable lowercase identifier (letters, digits, `_`, and `-`,
starting with a letter; maximum 64 characters). `name` is an editable display
name. Renaming the display name or file preserves the workflow's run history.
`description` and `env` are optional; `enabled` defaults to `true`. Workflow
variables apply to every step; a step's own variables take precedence.

Steps accept the fields above plus `enabled` (default `true`), `wasm` (default
`true`), `env`, and `working_directory`. `module` explicitly selects a module or
`shell`. Without `module`, existing full commands such as
`command = "fluentci run main test"` remain supported. For shell steps, use
`module = "shell"` and put the shell script in `command`.

```sh
fluentci workflows                   # IDs, names, state, step counts and files
fluentci workflows --steps           # detailed steps grouped by workflow
fluentci workflows ci --steps     # inspect one workflow
fluentci workflows --steps --json    # metadata with a steps array per workflow
fluentci run --workflow ci
```

Workflows execute ordered steps. Define CI event triggers under `[on]`; these
conditions affect exported CI manifests and are never evaluated by local runs.
Even a workflow with every CI event disabled can be run locally with
`fluentci run --workflow <id>` (provided the workflow itself is enabled).

```toml
[on]
manual = true
schedule = ["0 6 * * 1-5"] # UTC

[on.push]
branches = ["main", "release/**"]
tags = ["v*"]
paths = ["src/**", "fluentci.toml"]

[on.pull_request]
branches = ["main"] # target/base branches
paths = ["src/**"]
```

Omit `push` or `pull_request` from an explicit `[on]` block to disable that event.
An empty event table matches all refs/paths. Inclusive filters support `*`, `**`
and `?`; branch and path conditions both must match. Branch-only push filters
exclude tag pushes; tag-only filters exclude branch pushes. Tag pushes ignore
path filters. Schedules use five numeric UTC cron fields with `*`, ranges,
lists, and steps. Without an `[on]` block, defaults are pushes to `main` and
manual CI dispatch. The visual **Event triggers** section of Studio's Actions
composer edits and validates these settings.

GitHub exports `on.push`, `on.pull_request`, `workflow_dispatch`, and `schedule`.
GitLab maps events to `workflow.rules`, including target-branch and changed-path
conditions; schedules must also be created in GitLab CI/CD settings. Azure maps
to `trigger`, `pr`, and `schedules`; Azure Repos PR validation uses branch
policies. CircleCI exports GitHub App event conditions and rejects static path
filters it cannot represent. CircleCI schedules use project schedule triggers.
AWS CodeBuild buildspec exports include a commented webhook-filter payload and
EventBridge setup notes because triggers are configured outside the buildspec.
Provider notes are included in generated YAML, rather than silently dropping
unsupported conditions.

```sh
fluentci project export --workflow ci --github
fluentci project export --workflow ci --gitlab
```

Studio can create, duplicate, rename, enable, disable, and delete workflows and
edit their actions. It writes the same TOML files, with revision checks to reject
stale saves. Commit the workflow files; ignore `.fluentci/workflows/.lock`, the
local writer guard. Keep secrets out of version-controlled workflow files.

Existing root `[[steps]]` and saved project actions remain available as the
`default` workflow. Editing it in Studio creates
`.fluentci/workflows/default.toml`. The default workflow cannot be deleted.
Prepared runs snapshot their actions and environment in SQLite, so editing or
deleting a workflow does not change work already prepared or its saved history.

## Module logos

Each `[[modules]]` entry can include an optional `logo` picture URL:

```toml
[[modules]]
name = "sccache"
path = ".fluentci/sccache"
sdk = "purescript"
version = "0.1.0"
license = "MIT"
logo = "https://cdn.example/sccache.png"
```

Publishing copies it into `io.fluentci.plugin` and verifies HTTP 200 plus an
`image/*` Content-Type. `fluentci publish --logo URL` overrides the module value
and also supports file/URL publishing. HTTP(S) URLs must not contain credentials.
Studio module suggestions show the image, with a module icon for missing or
unavailable pictures. Omitting `logo` preserves compatibility with older records.
