---
title: "Core concepts"
description: "Understand workspaces, modules, jobs, actions, and the boundary between Wasm logic and host execution."
section: "Start here"
url: "/getting-started/concepts/"
source: "getting-started/concepts.md"
---

## Workspace

A workspace is the project root used for configuration discovery and execution.
The CLI can be invoked from a nested package. A discovered `fluentci.toml` is the
shared entry point; declared module paths resolve relative to that file.

## Module and job

A module is a named pipeline implementation. It can point to source code, a local
`.wasm` artifact, or an HTTP(S) Wasm URL. Source modules declare an SDK and are
compiled before invocation. A job is an exported plugin function such as `hello`
or `build`.

```sh
fluentci run ci build
fluentci modules ci --json
```

`ci` selects the module; `build` selects its export. Runtime/compiler helper
exports are filtered from user-facing discovery.

## Pipeline and step

A pipeline composes work. TOML steps describe commands and their environment or
working directory. SDK pipelines describe host operations using ordinary language
functions and SDK combinators. Configuration can invoke a plugin job or execute
shell commands.

## Wasm and host tools

A Wasm plugin packages pipeline logic, not an operating system or every build
dependency. The embedded engine exposes host capabilities through a PDK. Commands
such as `git`, `cargo`, or `bun` run on the host in the configured environment.
Environment providers can provision tools, but a `.wasm` file alone is not a
promise that every host has the dependencies a job needs.

Builder operations construct a pipeline; terminal operations execute it or read
results. SDK conventions differ: ClojureScript uses `stdout!`, PureScript returns
an `Either`, and Gleam returns a `Result`.

## Actions, runs, and projects

Studio stores projects and their ordered actions. Actions identify a module or
plugin and job commands. A run records an execution; jobs contain timing, status,
and logs. This application history lives in SQLite separately from engine build
caches and execution journals.

## Local and published modules

Declared module names take precedence over registry packages. A local workflow
can use no registry and no account. Published packages add metadata and a public
Wasm download URL, with identity based on publisher DID plus plugin name.

See [modules](/guides/modules/), [configuration](/reference/configuration/), and
[publishing](/registry/publishing/) for the exact fields and commands.
