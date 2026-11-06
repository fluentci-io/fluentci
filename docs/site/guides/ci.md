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
With a token, the `nix-build` module runs
`cachix watch-exec fluentci -- nix build --no-write-lock-file .#fluentci` through
the pinned Cachix executable. It uploads new build outputs and dependencies, then
explicitly pushes `./result` and its runtime closure. Upload failures fail CI.
Without a token, it runs the normal Nix build and skips uploads. The token needs
write access to the `fluentci` cache; it never appears in command arguments.

## Debian and RPM releases with Gemfury

The release workflow packages the Linux CLI and embedded Studio web interface as
Debian and RPM packages for x86_64 and arm64. It compiles the `gemfury` PureScript
module to Wasm once, then invokes its `dependencies`, `package`, and `upload`
functions on each native Linux runner. Packages and SHA-256 sidecars are also
attached to the GitHub release.

Packaging logic lives in `CI.LinuxPackages`, entirely in PureScript: validation,
metadata generation, native file writes, staging, verification, checksums, and
cleanup. The module calls `dpkg-deb` and `rpmbuild` directly, without a packaging
shell helper. Its `github` function attaches the exact package files and
checksums through the GitHub CLI.

Configure the GitHub Actions secrets `FURY_USER`, `FURY_TOKEN`, and `FURY_ACCOUNT`
for Gemfury. The user and token authenticate the request; the account selects
the upload destination. User and account can also be repository variables;
secrets take precedence.
Without a token, the workflow still builds and attaches the packages but skips
Gemfury uploads. With a token, missing user/account configuration and upload errors
fail the job. Credentials stay in the environment rather than command arguments.

The packages use the same Ubuntu 24.04 binaries as the release archives and
declare a glibc 2.39 minimum. Debian architecture names are `amd64`/`arm64`;
RPM architecture names are `x86_64`/`aarch64`.

## Publish the Nix flake

The FlakeHub and Flakestry publishing workflows run when a release tag such as
`v0.17.0` is pushed to `fluentci-io/fluentci`. Both also support **Run workflow**:
enter an existing release tag in the required `tag` input to publish it manually.
Forks skip publication.

The shared `nix-publish.yml` workflow validates the tag, compiles and tests the
`nix` PureScript module, and publishes the tag's exact commit through its Wasm
`flakehub` or `flakestry` function. GitHub OIDC and the job token authenticate
publication; no additional registry secret is required. Publishing is separate
from the default checks and the Nix package build workflow.

## Unsupported remote execution

The unified CLI does not currently expose `fluentci run --remote-exec`. Run the
CLI on a CI runner instead. Existing legacy agent commands are separate from the
AT Protocol publishing account flow.
