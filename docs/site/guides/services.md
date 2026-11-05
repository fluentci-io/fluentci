---
title: "Services"
description: "Manage Procfile processes and distinguish them from services scoped to a native execution plan."
section: "Build pipelines"
url: "/guides/services/"
source: "guides/services.md"
---

## Procfile services

The CLI discovers service Procfiles under `.fluentci/*/Procfile` and manages them
through Overmind. Install Overmind and its runtime dependencies, including tmux,
before using these commands.

For example, create `.fluentci/clock/Procfile`:

```text
clock: sh -c 'while true; do date; sleep 10; done'
```

Then manage discovered services from the workspace:

```sh
fluentci up
fluentci ps
fluentci status clock
fluentci echo clock
fluentci restart clock
fluentci stop clock
fluentci down
```

`up` starts discovered services; `down` stops them. `echo` streams a service's
logs. Commands use the service's associated Overmind socket. Review Procfiles
before starting processes; their commands run on the local host.

## Services inside pipelines

Native host plans support service tasks with readiness/health probes, startup
limits, and dependencies. These belong to an execution plan rather than the
persistent Procfile service manager. A dependent task waits for the declared
service readiness contract.

Legacy SDK pipeline services use the SDK's service builders. Do not treat a
process merely starting as proof that a service is ready; use the relevant
health-probe API for native plans.

## Shutdown and failures

Keep process ownership clear. Stop workspace services with the service manager
that started them. For native plans, inspect the result journal and cancellation
outcome. Follow the [native plan guide](/guides/native-plans/) for graph-level
service behavior, and [troubleshooting](/reference/troubleshooting/) for missing
tools or sockets.
