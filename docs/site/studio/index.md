---
title: "Studio"
description: "A local workspace for projects, execution history, live logs, and pipeline spans."
section: "Studio and publishing"
url: "/studio/"
source: "studio/index.md"
---

## Start Studio

```sh
fluentci studio
fluentci studio --port 6080
```

The default URL is `http://localhost:6076`. Studio, GraphQL, and live events share
one loopback listener. Set `FLUENTCI_NO_OPEN=1` to suppress automatic browser
opening. The compiled CLI embeds the frontend; no Node server is required.

## Projects and actions

Open the current workspace, create a local project, or clone a Git repository.
Project settings allow editing names and metadata. Project-name availability is
validated. Saved actions select modules/jobs and configure execution options;
module/function and project-directory suggestions help populate supported fields.

The CLI and Studio share the same database. Use `--database` or
`FLUENTCI_DATABASE` to select a separate workspace history deliberately. Switching
databases changes which projects and runs are visible.

## Execute and inspect

Start a run, cancel active work, or re-run a job. Execution details include timed
steps and logs. The spans view presents execution timing, including a hover
cursor for comparing positions in a trace. Streaming logs can follow new output;
inspect older output as needed and resume following afterward.

The project overview shows recent execution bars and status information. The
sidebar can be collapsed. The bottom status line summarizes the local engine,
current project, and execution state.

## API and account state

GraphQL is available at `/graphql` and WebSocket events at `/ws`. Run
`fluentci server` for the local API without opening Studio.

Successful CLI authentication remembers non-secret identity in
`~/.fluentci/account.json` and caches public Tangled repository metadata in local
SQLite. GraphQL exposes this information through `currentAccount` and
`tangledRepositories`; it is not a saved password or an authenticated desktop
session. See [account authentication](/registry/authentication/).

For native packaging and its independent API listener, read
[Desktop app](/studio/desktop/).

## Workflows

Use the workflow selector above the project tabs to switch between independent
pipelines. **New workflow** creates a file under `.fluentci/workflows/`.
**Manage workflow** edits its display name, description, shared environment and
enabled state, or duplicates and deletes a named workflow. IDs remain fixed;
existing projects retain their **Default** workflow.

Actions, execution history, job reruns and CI exports follow the selected
workflow. Draft actions remain attached to their workflow when switching between
workflows. Save or discard action drafts before changing workflow metadata.
Stale saves are rejected; use **Discard changes and reload** to load the saved
file. Workflow files can also be edited in a text editor and committed to Git.

Press **⌘K / Ctrl+K** to search workflows across projects. Results show the
workflow name and parent project; opening a result selects that workflow. Saved
runs and log matches continue to open their own workflow, including historical
runs whose workflow file has been removed.

In a terminal, list the same project workflows with `fluentci workflows`, expand
steps grouped by workflow with `fluentci workflows --steps`, or execute one with
`fluentci run --workflow <id>`.

### Visual event triggers

Open **Actions** to configure **Event triggers** above the steps. Toggle push,
pull request and manual CI dispatch; add branch, tag and changed-path filters;
and enter UTC cron schedules. **Save triggers** persists the selected workflow's
`[on]` configuration. These conditions are translated by CI export and never
prevent manual local execution. Provider-specific setup notes appear in exported
YAML when triggers require external configuration. Save or discard action drafts
before editing triggers.

The clone-repository input uses Studio's Tangled repository suggestions with
native browser autocomplete disabled.

Pipeline tabs stay at the top while scrolling. Workflow selection, management,
and the pipeline control become available in the header when their original
controls scroll out of view. Module suggestions distinguish local declarations
from registry packages, include published function names, and show module logos
with an icon fallback. Registry suggestions require network access; local and
custom module values remain usable offline.

## Git controls and repository suggestions

Git projects show the current branch, a local branch picker, and a **Pull**
button. These controls stay available in the header when their original position
scrolls out of view. Detached checkouts show the commit instead of a branch;
pulling requires a branch with an upstream. Pull uses fast-forward-only updates,
and branch switching preserves Git's protection for local changes. Archived
projects and active project runs cannot mutate the working tree. Save or discard
unsaved Studio action drafts before switching branches or pulling.

After switching or pulling, Studio reloads workflow definitions, actions, local
module/function suggestions, and project directories. Other open Studio clients
receive a `project-git` event. Git status also refreshes every ten seconds,
including changes made from a terminal. A selected workflow missing from the new
branch falls back to the default workflow after a Studio Git operation.

The clone dialog shows Tangled's logo and readable `handle/repository` names,
with the actual clone URL underneath. Search matches both labels and URLs;
selection fills the clone URL. Tangled's logo is bundled for offline use.

Expanded job headers stay pinned directly below the project tabs while scrolling
through logs. Their offset adapts when the pinned Git controls are visible.
