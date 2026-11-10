---
title: "AI agent skills"
description: "Install FluentCI agent skills for CI/CD pipelines, typed Wasm modules, GitHub Actions workflows, build caching, and CI services."
section: "Build pipelines"
url: "/guides/agent-skills/"
source: "guides/agent-skills.md"
---

Teach a coding agent how to work with FluentCI: discover module functions, write
programmable CI/CD pipelines, configure workflows, diagnose caches, and manage
test services. The official collection lives in
[fluentci-io/skills](https://github.com/fluentci-io/skills) and follows the
[Agent Skills format](https://agentskills.io/specification).

These skills provide task-specific instructions and references. They use the
FluentCI CLI and do not require an MCP server. The
[skills CLI](https://skills.sh/docs/cli) installs them into supported agents,
including Codex, Claude Code, and Cursor.

## Install the collection

```sh
npx skills add fluentci-io/skills
```

Choose the skills and agents in the installer. The default scope is the current
project; add `-g` for a user-wide installation. With Bun, the equivalent command is:

```sh
bunx skills add fluentci-io/skills
```

To inspect the available skills without installing them:

```sh
npx skills add fluentci-io/skills --list
```

The skills installer does not install FluentCI itself. Follow
[CLI installation](/getting-started/installation/) if the agent's environment does
not already have it. Source modules also need their SDK compiler; precompiled
Wasm modules still need the host tools used by their jobs.

## Choose a skill

Each skill is independently installable and includes its own supporting references.

| Skill                                                                                                 | What the agent can work on                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [fluentci-ci-cd](https://github.com/fluentci-io/skills/tree/main/skills/fluentci-ci-cd)               | Inspect CLI capabilities, discover typed function arguments, run local or registry modules, and diagnose failures.         |
| [fluentci-wasm-modules](https://github.com/fluentci-io/skills/tree/main/skills/fluentci-wasm-modules) | Create typed Wasm components, maintain module metadata, install dependencies, and prepare or publish releases.             |
| [fluentci-ci-workflows](https://github.com/fluentci-io/skills/tree/main/skills/fluentci-ci-workflows) | Maintain multiple workflows, push/PR triggers, reusable setup modules, and CI exports such as GitHub Actions or GitLab CI. |
| [fluentci-dag-caching](https://github.com/fluentci-io/skills/tree/main/skills/fluentci-dag-caching)   | Design native task graphs, configure cache inputs and outputs, preview Git-affected tasks, and investigate cache misses.   |
| [fluentci-ci-services](https://github.com/fluentci-io/skills/tree/main/skills/fluentci-ci-services)   | Run databases and background test services with readiness checks, scoped cleanup, and logs.                                |

Start with the general CLI skill:

```sh
npx skills add fluentci-io/skills --skill fluentci-ci-cd
```

Or select the skills needed for a particular task:

```sh
npx skills add fluentci-io/skills \
  --skill fluentci-ci-workflows \
  --skill fluentci-dag-caching
```

## Ask the agent to work on a pipeline

Describe the desired result and any constraints. The agent can select the relevant
installed skill based on the task; selection and explicit invocation controls
depend on the agent.

Example requests:

- “Inspect this module's functions and run its checks with the correct named arguments.”
- “Create a TypeScript Wasm component with a typed deployment function. Prepare it without deploying.”
- “Split this project into CI and release workflows, then export GitHub Actions.”
- “Preview which tasks changed since the merge base with origin/main, without executing them.”
- “Explain this build's cache miss and fix the input/output declarations.”
- “Run Redis for the test suite and release its services when the tests finish.”

The skills guide the agent to inspect the installed CLI, module contracts, and
project configuration. Function arguments come from the selected module's
metadata or WIT interface, rather than a universal set of flags. Existing locks
and runtime choices are preserved unless the task calls for changing them.

## Execution and credentials

Skills do not override repository instructions or user restrictions. If local
execution is prohibited, the agent should inspect source and configuration
instead of running the CLI. Installing a skill does not execute a FluentCI job.

Module discovery and help can build or download modules, including custom build
commands. The native plan's `fluentci execute --dry-run` previews task selection;
it is not a global dry-run mode for arbitrary module functions or publishing.
See [native plans](/guides/native-plans/) and [CLI commands](/reference/cli/).

Local execution does not require a registry account. Publishing uses the account's
environment-provided credentials; see [authentication](/registry/authentication/).
Do not put app passwords in agent prompts or committed configuration. Installing
these instructions does not authorize a deployment or registry publication.

## Find and update skills

Search by task, optionally scoped to the official GitHub owner:

```sh
npx skills find ci-cd --owner fluentci-io
npx skills find workflows --owner fluentci-io
npx skills find caching --owner fluentci-io
```

Search indexing is separate from GitHub availability. If a new skill is missing
from search, use the direct repository installation command above. The
[skills.sh FAQ](https://skills.sh/docs/faq) explains directory discovery and rankings.

Update installed skills with:

```sh
npx skills update
```

For the current catalog and installation details, see the
[skills repository](https://github.com/fluentci-io/skills).
