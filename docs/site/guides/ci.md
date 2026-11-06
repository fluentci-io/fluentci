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
fluentci project export PROJECT_NAME --semaphore > .semaphore/semaphore.yml
```

The GitHub provider is the default. The project must be registered locally.
Without a name, export selects the current directory's saved project. Pass
`--workflow checks` to select `.fluentci/workflows/checks.toml`; otherwise export
uses `default`. Only enabled steps are exported, in order. The workflow environment
is merged with each step's environment, and working directories are preserved.
Module arguments remain literal arguments; shell actions run through Bash. A failed
command stops subsequent steps.

## Events and provider setup

Configure `[on]`, `[on.push]`, and `[on.pull_request]` in the workflow file or use
Studio's visual event composer. Pull-request branch filters select the **target**
branch. Filters are inclusive globs using `*`, `**`, and `?`; schedules are
five-field UTC cron expressions. These events never gate a manual local run.

| Provider        | Trigger mapping and setup                                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions  | Push, pull request, manual dispatch and schedules are in workflow YAML.                                                                                                                                                                                   |
| GitLab          | Workflow rules map event sources, branches, tags and paths. Create scheduled pipelines in project settings using the cron instructions in the export.                                                                                                     |
| Azure Pipelines | YAML contains push, PR and schedule filters. PR triggers require GitHub/Bitbucket; Azure Repos needs branch validation policies. Manual access uses pipeline permissions.                                                                                 |
| CircleCI        | Uses GitHub App event conditions; enable matching project triggers and configure schedules separately. Static path filters are rejected.                                                                                                                  |
| Semaphore       | Save `.semaphore/semaphore.yml`, enable selected events in project settings, and create scheduled Tasks separately. The ordered job checks event type and target branch/tag before running steps. Unmatched events skip steps. Path filters are rejected. |
| AWS CodeBuild   | Buildspec controls commands. Export comments include the separate webhook filter payload and schedule/IAM instructions; apply these to the project.                                                                                                       |

Provider YAML cannot configure every project setting. Export comments identify
required external setup. See the [Semaphore pipeline specification](https://docs.semaphore.io/reference/pipeline-yaml)
and [event variables](https://docs.semaphore.io/reference/env-vars) for Semaphore's
runtime filter inputs.

## Runner requirements

Exports install FluentCI with `fluentci-io/setup-fluentci@next` on GitHub and the
source installer elsewhere. The GitLab image installs curl, Git and CA certificates
first. Configure compiler tools required by source SDKs, secrets, and artifact
uploads for the chosen runner. Precompiled Wasm still requires tools called by its
jobs. Keep app passwords in CI secrets rather than workflow files.

## Nix package CI

The flake exposes `.#fluentci` (also the default package) and `.#studio` for
`x86_64-linux`, `aarch64-linux`, and `aarch64-darwin`. Intel macOS is excluded.
Crane builds the Rust CLI and embeds Studio assets built with Bun. Dependencies
are pinned by `Cargo.lock`, `bun.lock`, and `flake.lock`.

```sh
nix build .#fluentci
# After changing bun.lock, refresh its Nix fetchers:
bun scripts/generate-bun-nix.mjs
```

`.github/workflows/nix-build.yml` runs on pushes to `main` and manual dispatch.
It compiles the `nix-build` and `cachix` PureScript modules once, then runs their
Wasm on the three native platforms. Cachix setup runs before the Nix build. Set
the `CACHIX_AUTH_TOKEN` repository secret; the workflow uses the `fluentci` cache.
Missing or empty tokens skip Cachix and continue the build.
Setup with a token configures cache downloads; it does not push build outputs.
The `nix-build` module runs only `nix build --no-write-lock-file .#fluentci`.

## Unsupported remote execution

The unified CLI does not currently expose `fluentci run --remote-exec`. Run the
CLI on a CI runner instead. Existing legacy agent commands are separate from the
AT Protocol publishing account flow.
