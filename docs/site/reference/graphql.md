---
title: "GraphQL and events"
description: "Query local Studio state and subscribe to execution updates on the loopback API."
section: "Reference"
url: "/reference/graphql/"
source: "reference/graphql.md"
---

## Endpoints

```sh
fluentci server --port 6076
```

GraphQL and GraphiQL are at `http://localhost:6076/graphql`. Live WebSocket events
use `ws://localhost:6076/ws`. Studio mode serves the frontend as well; desktop
mode uses a separate OS-assigned loopback port.

This API controls local projects and execution. It is distinct from the public
registry's XRPC API and is not a hosted authentication boundary. Keep it scoped
to trusted local use.

## Query projects

```graphql
query Projects {
  projects(limit: 20) {
    id
    name
    path
  }
  countProjects
}
```

```sh
curl -sS http://localhost:6076/graphql \
  -H 'Content-Type: application/json' \
  --data '{"query":"{ projects(limit: 20) { id name path } }"}'
```

Common queries include `actions(projectId: ...)`, `getRuns(projectId: ...)`,
`getRun(id: ...)`, `jobs`, `job(id: ...)`, `logs(jobId: ...)`, and full-text
`search(query: ...)`. Project/run pagination supports the arguments exposed by
the schema. Use GraphiQL's introspection for exact input and result types.

## Run a project

```graphql
mutation RunProject($projectId: ID!) {
  runPipeline(projectId: $projectId, wait: false) {
    id
    status
    jobs {
      id
      name
      status
    }
  }
}
```

`wait: false` schedules execution and returns the pending run. Query history or
consume events for completion. `wait: true` waits for execution. Additional
mutations manage projects, save actions, re-run jobs, and cancel runs. Cancellation
status should not be treated as proof that every external side effect was undone.

## Identity and suggestions

```graphql
query LocalIdentity {
  currentAccount {
    account
    did
    handle
    pds
  }
  tangledRepositories {
    uri
    name
    cloneUrl
    author
    knot
  }
}
```

Identity comes from the remembered account file. Repository suggestions come
from the local cache for that account DID. No password or reusable session token
is returned. Other suggestion queries include `actionSuggestions`,
`projectDirectories`, and `projectNameAvailable`.

## Live events

The WebSocket sends JSON envelopes with `channel` and `data`. Channels include
project, run, job, and log updates:

```json
{
  "channel": "job",
  "data": { "id": "example", "name": "check", "status": "RUNNING" }
}
```

The example is an envelope sketch, not a complete job schema. Events supplement
durable GraphQL state. Re-query after reconnecting instead of assuming the socket
replays every missed event. The broadcast implementation can skip lagged updates.
The compatibility field `exportActions` retains the argument spelling `plateform`.

## Workflow-scoped actions and execution

```graphql
query Workflows($projectId: ID!) {
  workflows(projectId: $projectId) {
    id
    name
    description
    enabled
    env
    path
    revision
    stepCount
    legacy
  }
  actions(projectId: $projectId, workflowId: "ci") {
    name
    plugin
    commands
    enabled
    useWasm
    env
    workingDirectory
  }
  getRuns(projectId: $projectId, workflowId: "ci") {
    id
    workflowId
    workflowName
    status
  }
}
```

`createWorkflow` takes `NewWorkflowInput` (`id`, `name`, optional `description`
and `copyFrom`). `updateWorkflow` takes `WorkflowUpdateInput` (`name`,
`description`, `enabled`, `env`, `events`, `expectedRevision`). IDs are immutable.
`deleteWorkflow` removes a named file while preserving execution history.
Workflow mutations emit a `workflow` event so connected clients refresh metadata.

Pass `workflowId` to `saveActions`, `runPipeline`, `runJob`, `exportActions`,
`getRuns`, and `countRuns` to select a workflow. Omitting it selects `default`
for actions, execution and export, and all workflows for history queries.
`saveActions`, `updateWorkflow` and `deleteWorkflow` accept `expectedRevision`
to reject stale writes. Use the metadata's revision, or an empty string for a
legacy default that has not yet been written to a file.

`WorkflowEventsInput` contains optional `push`/`pullRequest` filters (`branches`,
`tags`, `paths` arrays), `manual`, and a `schedule` array of UTC cron expressions.
PR filters do not support tags. Send `null` for a disabled event. CI event settings
are metadata only during local execution; `runPipeline` never evaluates them.
