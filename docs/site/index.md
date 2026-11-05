---
title: Introduction
description: Strongly typed, functional CI/CD pipelines. Build locally, reuse Wasm plugins, and keep the same workflow in CI.
section: Start here
url: /
source: index.md
---

FluentCI combines a Rust CLI, an embedded WebAssembly engine, and Studio in one
tool. Write pipeline logic in a language SDK or compose commands in TOML. Run
locally, inspect the result, then use the same CLI on a runner.

## Start building

1. [Install the CLI](/getting-started/installation/).
2. [Run a first pipeline](/getting-started/quick-start/).
3. [Choose a language SDK](/sdks/).
4. [Open Studio](/studio/) for projects, live logs, and execution history.

```sh
curl -fsSL https://cli.fluentci.io | sh
export PATH="$HOME/.local/bin:$PATH"
fluentci init --sdk clojurescript
fluentci run main hello
```

The ClojureScript starter additionally needs JDK 21+, Clojure CLI, Node/npm,
extism-js, and Binaryen. [Installation](/getting-started/installation/) separates
the CLI from the compiler tools needed to build source plugins.

## How it works

The CLI discovers a workspace and reads `fluentci.toml`. It builds declared source
modules into `.wasm` artifacts, discovers their exported jobs, and invokes the
embedded engine. Wasm carries the pipeline logic; commands execute on the host
with its tools, files, and configured environment providers.

Local execution and Studio require no account. [Authentication](/registry/authentication/)
is needed to publish plugin records to an AT Protocol account.

## Find the right guide

| Goal                               | Read                                         |
| ---------------------------------- | -------------------------------------------- |
| Compose commands and reusable jobs | [Pipeline configuration](/guides/pipelines/) |
| Work in a monorepo                 | [Workspace modules](/guides/modules/)        |
| Run the same pipeline in CI        | [CI and exports](/guides/ci/)                |
| Share a plugin                     | [Publishing](/registry/publishing/)          |
| Extend the CLI or API              | [Architecture](/development/architecture/)   |

These docs describe this repository's unified `fluentci` CLI. Separate
`fluentci-engine` commands are identified explicitly when discussing engine APIs.
