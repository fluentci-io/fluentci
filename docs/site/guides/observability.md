---
title: "Logs and tracing"
description: "Follow local execution, inspect timing in Studio, and configure engine telemetry."
section: "Studio and publishing"
url: "/guides/observability/"
source: "guides/observability.md"
---

## CLI and Studio output

The CLI streams command output and propagates failures. Studio stores run/job
status, timestamps, and logs in the application database, while live events update
the UI. Use a project's execution details to inspect individual steps and re-run
a job when appropriate.

Log following keeps the latest output in view. Pausing or scrolling to older
output is useful during long jobs. The spans view adds a timeline and hover
cursor for comparing job timing. A saved run's history and the engine's own
execution journals are separate stores.

## Diagnostic logging

```sh
RUST_LOG=info fluentci run ci hello
RUST_LOG=debug fluentci --check-update=false modules ci --json
```

JSON discovery output is kept separate from build diagnostics. Capture stdout
for machine-readable results and stderr for diagnostic context. Debug output can
contain paths and command metadata; handle captured logs according to the
project's data policies.

## Engine tracing

The embedded engine supports these telemetry settings:

| Variable                          | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT`     | OTLP collector endpoint                          |
| `OTEL_EXPORTER_OTLP_PROTOCOL`     | OTLP transport selection supported by the engine |
| `OTEL_EXPORTER_ZIPKIN_ENDPOINT`   | Zipkin endpoint                                  |
| `OTEL_EXPORTER_JAEGER_AGENT_HOST` | Jaeger agent host                                |
| `BASELIME_API_KEY`                | Baselime logging integration                     |

Collector credentials, reachability, and transport settings belong to the
deployment. Enabling a variable does not provision a collector. Local spans and
logs remain useful without a remote telemetry backend.

## Debug a failed native plan

Inspect its fresh run directory and result journal for task outcomes, retries,
cache diagnostics, service probes, and cancellation state. Do not infer success
from a plugin merely returning a serialized plan: only a terminal execution call
submits the graph.
