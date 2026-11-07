---
title: "CLI commands"
description: "The unified FluentCI command surface, global options, and common invocation patterns."
section: "Reference"
url: "/reference/cli/"
source: "reference/cli.md"
---

## Global options

```sh
fluentci --help
fluentci --version
fluentci --database ./state.db --check-update=false studio
```

| Option                       | Behavior                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `--database PATH`            | Local SQLite database; defaults to `~/.fluentci/fluentci.db`; also reads `FLUENTCI_DATABASE` |
| `--check-update true\|false` | Enable/disable normal update checking; default `true`                                        |
| `--help`, `-h`               | Show command help                                                                            |
| `--version`, `-V`            | Show CLI version                                                                             |

Use `fluentci COMMAND --help` for argument details from the installed binary.
The CLI also supports a bare pipeline invocation, but explicit `run` is clearer
in automation.

Module help reads metadata without invoking any Wasm function or opening the local
database. Both `--help` and `-h` are supported:

```sh
fluentci run sccache --help
fluentci run sccache setup -h
fluentci run ./plugin.wasm --help
fluentci run https://modules.fluentci.io/fluentci.io/sccache/v0.1.0/sccache.wasm --help
```

Module help lists exported functions, signatures, and descriptions. Function help
shows argument names, types, descriptions, and the return type when the SDK or
published metadata provides them. Without source metadata, help lists exports and
reports that argument details are unavailable; Wasm ABI types are not source parameters.
Declared local modules take precedence over registry names. Registry artifacts may
be downloaded and local source modules may be built to inspect their metadata.
For locked packages, registry help metadata is fetched for the pinned publisher and
version and checked against the locked checksum. If the registry is unreachable,
help falls back to the cached artifact's exports and embedded metadata.
`fluentci --help` and `fluentci run --help` continue to show CLI usage.

## Pipelines and modules

| Command                                  | Purpose                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `run [PIPELINE] [JOBS...]`               | Run a declared module, local pipeline, module path, or registry package; selector defaults to `.` |
| `run --wasm PIPELINE JOB`                | Explicit Wasm invocation                                                                          |
| `run --work-dir PATH ...`                | Select the execution working directory                                                            |
| `install [--frozen-lockfile]`            | Resolve declared registry/Git dependencies and prepare caches; generate or verify `fluentci.lock` |
| `update [MODULE]`                        | Refresh all locked dependencies or a module alias/package reference                               |
| `run --frozen-lockfile ...`              | Run using existing locks; reject missing or changed dependencies                                  |
| `run --reload ...`                       | Reload legacy TypeScript pipeline sources                                                         |
| `init [NAME] --sdk SDK`                  | Create workspace config and a starter module; SDK defaults to Rust                                |
| `init --standalone --sdk SDK`            | Generate a reusable package in the current directory                                              |
| `init --template PACKAGE`                | Initialize from a registry template where supported                                               |
| `modules [NAME] --json`                  | Discover module paths, SDKs, and job exports; may build source                                    |
| `modules add NAME --sdk SDK`             | Scaffold and declare a module                                                                     |
| `modules add NAME --path PATH --sdk SDK` | Register existing source or artifact                                                              |
| `modules add NAME --url URL`             | Register an HTTP(S) Wasm artifact                                                                 |
| `inspect`                                | Alias for `modules`                                                                               |
| `ls [PIPELINE]`                          | List jobs; alias `list`                                                                           |
| `docs [PIPELINE]`                        | Render pipeline documentation using Glow; alias `man`                                             |
| `repl [PIPELINE] --debug`                | Interactive pipeline/module session                                                               |

SDK selectors: `rust`, `clojurescript`, `purescript`, `typescript`, `python`,
`gleam`, `elixir`, `rescript`. Existing Elixir registration can use
`--entry Main`; Python entry selection can use `--entry plugin.py`.

## Studio and projects

| Command                             | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `studio --port 6076`                | Serve Studio and its local API; open a browser by default |
| `server --port 6076`                | Serve the local GraphQL/live-event API                    |
| `project create`                    | Create an initially empty saved project                   |
| `project list`                      | List saved projects                                       |
| `project show NAME`                 | Print project details by name or ID                       |
| `project export [NAME] --github`    | Export enabled saved actions as GitHub YAML               |
| `project export [NAME] --gitlab`    | Export GitLab configuration                               |
| `project export [NAME] --azure`     | Export Azure Pipelines configuration                      |
| `project export [NAME] --circleci`  | Export CircleCI configuration                             |
| `project export [NAME] --semaphore` | Export a Semaphore pipeline (`.semaphore/semaphore.yml`)  |
| `project export [NAME] --aws`       | Export an AWS CodeBuild buildspec                         |

## Registry and account

| Command                                | Purpose                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `search QUERY --limit 20`              | Search registry package versions                                     |
| `whoami`                               | Authenticate with account/app-password environment and show identity |
| `publish --module NAME`                | Build a module, upload Wasm, and create PDS metadata                 |
| `publish --name NAME --file FILE.wasm` | Publish an existing artifact                                         |
| `publish --name NAME --url URL.wasm`   | Validate and publish a public artifact without uploading             |
| `upgrade`                              | Install the latest published CLI release                             |

`--file` and `--url` are mutually exclusive. Supply their package name with
`--name` or enter it at the prompt. Missing name, version, and license must be
supplied in non-interactive runs. Description is optional.
`--name`, `--version`, `--description`, `--license`, `--repository`, and `--subdir`
override module metadata. `--manifest JSON` supplies SDK-independent function metadata.
`--module` selects module metadata and builds that module when no artifact is supplied.
`publish --wasm` remains an accepted compatibility flag; publishing uses Wasm.
There is no `login` command, and `run --remote-exec` is unsupported.

## Tools and services

`doctor` checks external tools; `env` prints workspace environment values;
`community` opens the community link. Built-in service commands are `up`, `down`, `ps`,
`status NAME`, `start NAME`, `restart NAME`, `stop NAME`, and `echo NAME`.
`logs NAME [--follow] [--tail N]` reads captured output.
`services status --json`, `services apply --json JSON`, and
`services run [--service NAME] -- COMMAND...` support code and CI.
See the [services guide](/guides/services/).

The legacy `agent` and `agent list` commands belong to hosted runner compatibility,
not the AT Protocol publishing authentication flow. Internal worker commands are
implementation details and should not be called by integrations.

## Direct invocation and documentation

```sh
fluentci @tsiry-sandratraina.com/sccache@v0.1.0 build ...
fluentci run @tsiry-sandratraina.com/sccache build ...
fluentci https://plugins.example/shared.wasm hello
fluentci docs sccache
```

Registry references and URLs do not require a local configuration file. Omitted
versions and `@latest` initially resolve the latest stable release, then use the
lockfile. `docs` renders a source module's `README.md` with `glow`; Git modules
use the locked commit and configured subdirectory. Published packages use their
optional repository/subdirectory metadata. Missing READMEs are reported without
inventing a documentation URL.

## Workflows

```sh
fluentci workflows
fluentci workflows --steps
fluentci workflows --json
fluentci workflows ci --steps     # inspect one workflow
fluentci workflows --steps --json
fluentci run --workflow release
```

`workflows` lists every workflow in the current project, including the legacy
`default` workflow. `--steps` expands the ordered steps **under each workflow**,
showing enabled state, module, Wasm selection, working directory, commands, and
configured environment. With `--json --steps`, each workflow contains its own
`steps` array. Without `--steps`, JSON contains workflow summary metadata only.
Listing also works before the project has been opened in Studio.

`run --workflow <id>` executes a named workflow using shared root modules and
records its own run history. It does not require `--wasm` and cannot be combined
with module/function arguments. Manage workflow files in
`.fluentci/workflows/*.toml` or use Studio's workflow controls. See
[workflow configuration](/reference/configuration/#multiple-workflows).

## Typed named arguments

See [typed module arguments](/guides/module-arguments/) for the shared SDK contract.

```sh
fluentci modules embed dist/plugin.wasm --manifest fluentci.metadata.json
fluentci run ./dist/plugin.wasm build --src demo --jobs 4 --verbose
fluentci run ./dist/plugin.wasm build --help
```

## Add and install module dependencies

From a module root containing `fluentci-module.toml`:

```sh
fluentci add sccache@v0.1.0
fluentci add @publisher.example/cache@latest --alias cache
fluentci add math --path ../math
fluentci add math --url https://example.com/math.wasm
fluentci add math --git https://github.com/example/modules --rev main --subdir modules/math
fluentci install
fluentci install --frozen-lockfile
fluentci run math --help
```

`add` edits the module's `[dependencies]`, downloads/builds the Wasm into a
Git-ignored `fluentci_modules/`, and updates `fluentci.lock`. `--alias` changes the
local import name. `--path`, `--url`, and `--git` are mutually exclusive; `--rev`
and `--subdir` apply to Git sources. See [module dependencies](/guides/module-dependencies/).
