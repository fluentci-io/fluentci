---
title: "Pipeline configuration"
description: "Compose shell commands and reusable module jobs in a readable fluentci.toml."
section: "Build pipelines"
url: "/guides/pipelines/"
source: "guides/pipelines.md"
---

## Start with steps

```toml
[[steps]]
name = "install"
command = "bun install --frozen-lockfile"

[[steps]]
name = "test"
command = "bun run test"

[[steps]]
name = "build"
command = "bun run build"
```

Run from the workspace with `fluentci run`. A command array provides multiple
commands for one step:

```toml
[[steps]]
name = "check"
command = ["cargo fmt --check", "cargo test --release --locked"]
env = ["RUST_LOG=info"]
working_directory = "apps/backend"
```

Shell commands have shell quoting semantics. Keep untrusted values out of command
strings; SDK argv-vector APIs are preferable when passing dynamic arguments.

## Call an SDK job

```toml
[[modules]]
name = "ci"
path = ".fluentci/ci"
sdk = "purescript"

[[steps]]
name = "validate"
command = "fluentci run ci hello"
```

The job can also be called directly with `fluentci run ci hello`. Keep reusable
logic in modules and use TOML to describe the workspace's entry points.

## Select a working directory

```sh
fluentci run --work-dir ./apps/backend
```

The explicit working directory controls command execution while workspace
configuration remains discoverable at the root. A step's `working_directory`
lets a shared pipeline target a package. Module source paths still resolve from
the configuration file, not from whichever package invoked the CLI.

## Environment values

Use a step's `env` for non-secret configuration, or load workspace values from
`.fluentci/.env`. SDKs also expose environment builders for plugin-specific work.
See [environment and providers](/guides/environment/) before adding credentials.

## Validate incrementally

Run one module job while developing, then execute the root pipeline. Inspect
[Studio logs](/guides/observability/) for exit status and output. Keep
[SDK build tools](/sdks/) separate from the tools invoked by the resulting job.
