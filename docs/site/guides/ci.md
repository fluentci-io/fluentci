---
title: "CI and exports"
description: "Run the same declared modules on a runner and export Studio actions to common CI providers."
section: "Build pipelines"
url: "/guides/ci/"
source: "guides/ci.md"
---

## Run a module in GitHub Actions

```yaml
name: Pipeline
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fluentci-io/setup-fluentci@next
      # Install the compiler/toolchain required by the selected module here.
      - run: fluentci --check-update=false run ci hello
```

This example assumes the workspace declares `ci` and that the runner has its SDK
compiler tools. The setup action installs FluentCI; it does not make every
language toolchain available. Pin versions according to the project's release
policy. Precompiled modules avoid source compilation but still need the host
tools called by their jobs.

## Export saved actions

Studio stores ordered project actions. Export them in the UI's CI export tab, or
use the CLI after the project has been registered:

```sh
fluentci project list
fluentci project export PROJECT_NAME --github > workflow.yml
fluentci project export PROJECT_NAME --gitlab > gitlab-ci.yml
fluentci project export PROJECT_NAME --azure > azure-pipelines.yml
fluentci project export PROJECT_NAME --circleci > circleci.yml
fluentci project export PROJECT_NAME --aws > buildspec.yml
```

The GitHub provider is the default. The named project must exist in the local
database. Without a name, export selects the current directory's saved project.
Export uses enabled saved actions, not an arbitrary TOML document that has never
been associated with the project.

## Review runner assumptions

Generated YAML is a starting point. Review compiler setup, secret injection,
working directories, checkout behavior, and artifact uploads for the target
runner. Keep account app passwords in runner secrets rather than the manifest.
The public installer is `https://cli.fluentci.io`; generated provider setup can
also reference the installer source directly.

## Unsupported remote execution

The unified CLI does not currently expose `fluentci run --remote-exec`. Run the
CLI on a CI runner instead. Existing legacy agent commands are separate from the
AT Protocol publishing account flow.
