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
