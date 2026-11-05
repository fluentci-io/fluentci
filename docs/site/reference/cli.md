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

## Pipelines and modules

| Command                                  | Purpose                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `run [PIPELINE] [JOBS...]`               | Run a declared module, local pipeline, module path, or registry package; selector defaults to `.` |
| `run --wasm PIPELINE JOB`                | Explicit Wasm invocation                                                                          |
| `run --work-dir PATH ...`                | Select the execution working directory                                                            |
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

| Command                            | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `studio --port 6076`               | Serve Studio and its local API; open a browser by default |
| `server --port 6076`               | Serve the local GraphQL/live-event API                    |
| `project create`                   | Create an initially empty saved project                   |
| `project list`                     | List saved projects                                       |
| `project show NAME`                | Print project details by name or ID                       |
| `project export [NAME] --github`   | Export enabled saved actions as GitHub YAML               |
| `project export [NAME] --gitlab`   | Export GitLab configuration                               |
| `project export [NAME] --azure`    | Export Azure Pipelines configuration                      |
| `project export [NAME] --circleci` | Export CircleCI configuration                             |
| `project export [NAME] --aws`      | Export an AWS CodeBuild buildspec                         |

## Registry and account

| Command                    | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `search QUERY --limit 20`  | Search registry package versions                                     |
| `whoami`                   | Authenticate with account/app-password environment and show identity |
| `publish --module NAME`    | Build a module, upload Wasm, and create PDS metadata                 |
| `publish --file FILE.wasm` | Publish an existing artifact                                         |
| `publish --url URL.wasm`   | Validate and publish a public artifact without uploading             |
| `upgrade`                  | Install the latest published CLI release                             |

`--module`, `--file`, and `--url` are mutually exclusive publish inputs.
`publish --wasm` remains an accepted compatibility flag; publishing uses Wasm.
There is no `login` command, and `run --remote-exec` is unsupported.

## Tools and services

`doctor` checks external tools; `env` prints workspace environment values;
`community` opens the community link. Procfile commands are `up`, `down`, `ps`,
`status NAME`, `start NAME`, `restart NAME`, `stop NAME`, and `echo NAME`.

The legacy `agent` and `agent list` commands belong to hosted runner compatibility,
not the AT Protocol publishing authentication flow. Internal worker commands are
implementation details and should not be called by integrations.
