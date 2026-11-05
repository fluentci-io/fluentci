---
title: "First pipeline"
description: "Scaffold a typed plugin, run its exported job, and inspect the execution in Studio."
section: "Start here"
url: "/getting-started/quick-start/"
source: "getting-started/quick-start.md"
---

## Prepare a workspace

This walkthrough uses ClojureScript. Install its [SDK toolchain](/sdks/clojurescript/)
first, or use `fluentci init` for the default Rust starter.

```sh
mkdir fluentci-demo
cd fluentci-demo
git init
fluentci init --sdk clojurescript
```

The starter's `hello` job runs `git status`, so initialize Git before invoking it.
Initialization creates `fluentci.toml` and a module under `.fluentci/main`.
The SDK source is bundled into that module; a sibling engine checkout is not
required.

## Read the configuration

The root configuration declares the module and a step that invokes its `hello`
export. Inspect the generated file instead of creating a second declaration.
A minimal equivalent is:

```toml
[[modules]]
name = "main"
path = ".fluentci/main"
sdk = "clojurescript"

[[steps]]
name = "hello"
command = "fluentci run main hello"
```

## Run and discover jobs

```sh
fluentci run main hello
fluentci modules main --json
fluentci run
```

The first source-module invocation installs project npm dependencies when needed,
runs the SDK build, produces `dist/plugin.wasm`, and calls `hello`. ClojureScript
builds perform static checks before compilation. Module discovery can also build
source modules; it is not just a directory listing.

`fluentci run` executes configured steps. An explicit module and job call is
useful while iterating on one part of a pipeline.

## Add another module

```sh
fluentci modules add checks --sdk purescript
fluentci run checks hello
```

The new module gets its own source directory and declaration. Existing config
comments and modules are preserved. Install the new SDK's compiler tools before
running it.

## Open Studio

```sh
fluentci studio
```

Visit `http://localhost:6076`. Studio and CLI commands share projects, actions,
and execution history in the local database. No account is needed for this flow.

Continue with [pipeline composition](/guides/pipelines/) or the full
[ClojureScript guide](/sdks/clojurescript/).
