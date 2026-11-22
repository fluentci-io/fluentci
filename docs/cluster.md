# FluentCI VM runner clusters

Run a horizontally scalable pool of **fresh VMs**, with one API origin and one
`fluentci` binary for every role. Choose etcd or Consul for shared state. A node
can join at any time, immediately advertise capacity, and begin claiming queued
work without restarting the API or other runners.

Think of `cluster join` as registering a GitLab or GitHub runner: the host stays
registered and polls for jobs, while each job receives a new disposable VM.

See the [architecture diagrams](cluster-architecture.md) for the control plane,
execution plane, job sequence, and failure boundaries.

## Start the API

Provision an etcd v3 HTTP gateway or a Consul agent HTTP API. Start the API:

```sh
fluentci cluster serve --state etcd --state-url http://127.0.0.1:2379 \
  --name development --listen 0.0.0.0:6080

# Or choose Consul:
fluentci cluster serve --state consul --state-url http://127.0.0.1:8500 \
  --name development --listen 0.0.0.0:6080
```

When `FLUENTCI_CLUSTER_TOKEN` / `--token` is unset, the server generates a fresh
256-bit token using the operating system's random source and displays it at
startup, along with an `export FLUENTCI_CLUSTER_TOKEN='...'` command for runners
and developer shells. Copy that token to register runners and submit work.

To keep the token stable across restarts or share it between API replicas, set
`FLUENTCI_CLUSTER_TOKEN` before starting each server. The configured token is
also displayed at startup. Empty or invalid configured tokens are rejected;
they never disable authentication. A generated token changes on restart.

The API uses Tokio/Axum. For availability, run several API replicas behind a TLS
load balancer, all with the same backend, cluster name, and secret. The state
backend is external; there is no separate FluentCI server or client executable.
The default API listener is `127.0.0.1:6080`. FluentCI's listener itself serves
HTTP; terminate TLS at your ingress when exposing it across networks.

## Add runner capacity at any time

Install [bsdkrun](https://github.com/tsirysndr/bsdkrun) and its hypervisor
requirements on each runner host (macOS Hypervisor.framework or Linux KVM).
Then run:

```sh
export FLUENTCI_CLUSTER_API=https://ci.example.com
export FLUENTCI_CLUSTER_TOKEN='<the shared cluster secret>'
fluentci cluster join --name builder-01 --slots 2 \
  --max-memory 4096 --label linux-arm64 --label trusted
```

`join` probes bsdkrun, registers a unique process ID, and starts polling the queue.
No inbound runner listener, static inventory, or backend credentials are needed.
Add another host with the same command whenever capacity is needed. Labels are
explicit operator claims; use them for architecture, hardware, or trust placement.
Jobs require **all** requested labels. CPU count and `--max-memory` also constrain
matching. Set `--slots` conservatively: resources are per VM, and operators must
ensure the combined VMs fit the host.

`join` runs in the foreground; use a process manager to supervise it. Ctrl-C or
SIGTERM stops admission, signals active jobs to remove their VMs, waits for cleanup,
and leaves the pool. Use a separate `--work-dir` for each independent runner
process (default `.fluentci/runner`). An exclusive lock prevents overlapping use
of that directory. Restart with the same directory to remove VMs left by a crash
before accepting new work. `--bsdkrun /absolute/path/to/bsdkrun` selects the
hypervisor CLI. This runner integration uses Linux OCI VMs.

```sh
fluentci cluster runners
fluentci cluster runners --json
fluentci cluster doctor
```

`doctor` checks API authentication, shared-state access, and live runner slots.
`cluster nodes` remains an alias for `cluster runners`.
Cluster commands bypass the local project SQLite database and update checks.

## Submit, inspect, and cancel a run

Use an OCI image containing `sh`, `git`, and all required tools. For FluentCI
pipelines, include the **Linux** `fluentci` binary in the image. Images and Git
repositories are downloaded by the runner/guest; the developer's local checkout
is not uploaded.

```sh
fluentci cluster submit \
  --image ghcr.io/your-org/fluentci-runner:stable \
  --repo https://github.com/your-org/your-project.git \
  --ref '<commit SHA>' --label linux-arm64 \
  --cpus 2 --memory 2048 --timeout 1800 \
  -- fluentci run

fluentci cluster runs
fluentci cluster inspect <run-id>
fluentci cluster cancel <run-id>
```

The default guest command is `fluentci run`. Commands travel as an argument vector,
not interpolated shell source. To intentionally use a shell, explicitly submit
`-- sh -c '<your command>'`. The checkout wrapper clones into `/workspace`, checks
out the supplied revision, and executes the guest command there. Pin the OCI
image digest and Git commit for reproducibility. HTTPS Git URLs without embedded
credentials are supported initially; private repository secret injection is not
implemented.

Submission prints its UUID before contacting the API. Reuse `--id <that UUID>`
to retry an ambiguous submission safely. The API returns the existing run for an
identical specification and rejects reuse with a different specification.

Each claimed job boots a new VM with its own root filesystem and specified CPU
and memory. The VM is removed before success/failure is published. `inspect`
returns durable status, exit code, bounded final stdout/stderr tails, and any
runner error. Each stream retains the last 16 KiB of raw bytes (invalid UTF-8 is
replaced); log collection keeps draining the stream after reaching the limit.
Live streaming, artifact storage, and retention policies are not implemented.
Avoid secrets in commands, repository URLs, or output: operator API readers can
inspect specifications and results.

## Coordination and failure behavior

Runner membership expires after 30 seconds without a heartbeat. Jobs are durable
records, separate from membership leases. A runner atomically claims a compatible
queued job using etcd transactions or Consul CAS. Every claim has a unique token
and a 30-second deadline; the runner renews every 10 seconds while executing.
Only the matching, unexpired owner/token may renew or publish a result.

API replicas use consistent backend reads and no process-local queue. Nodes
can join after submissions already exist, and those queued jobs remain available
until a matching runner arrives. The runner enforces its own slot count locally.
There is no automatic creation of additional host machines; horizontal scaling
means adding more `cluster join` processes on provisioned hosts.

A cancelled run stops accepting renewal, causing its runner to tear down the VM
on the next renewal attempt, normally within 10 seconds plus network/cleanup
time. A timeout also removes the VM. If a runner loses its claim or cannot renew,
it removes the VM rather than continuing to accept work under an expired claim.
If cleanup fails, it retains the journal and stops accepting new jobs.

An expired running claim is reported as `lost`, **never automatically retried**.
A database claim token cannot physically fence a crashed or partitioned host;
a stranded guest may continue until host recovery. Inspect external effects
before explicitly resubmitting a lost run. API clocks must be synchronized.
Completion after cancellation, ownership change, or claim expiry is rejected.
A result-publication failure can leave a job lost even if its VM finished; this
is preferable to silently executing potentially destructive CI work twice.

Membership uses short etcd leases or Consul sessions with delete behavior. Each
heartbeat replaces its lease/session, allowing any API replica to receive it.
Consul key replacement and new session attachment happen in one transaction so
expiration of the old session cannot delete refreshed membership. The API also
filters membership by its freshness deadline because Consul may delay reaping.

The initial queue scans the cluster's job prefix for compatible work; it has no
secondary indexes, job retention, or pagination. Backend value limits also apply.
This implementation provides horizontal execution capacity, not an unbounded
high-throughput queue. Admission, claims, cancellation, and result writes fail
closed when the backend is unavailable.

## API and configuration

Every route requires `Authorization: Bearer <cluster secret>`, including health
checks. The shared secret is a trusted operator credential for submissions,
runner registration, and run management; it is not a multi-tenant authorization
boundary. Keep runners and the state backend on trusted networks and use HTTPS
when credentials cross untrusted networks.

| Route                         | Behavior                                       |
| ----------------------------- | ---------------------------------------------- |
| `GET /healthz`                | API process liveness                           |
| `GET /readyz`                 | Shared-state readiness and live runners        |
| `GET /v1/nodes`               | Live runner metadata and capacity              |
| `POST /v1/nodes`              | Register or heartbeat a runner                 |
| `DELETE /v1/nodes/{id}`       | Remove discovery; a running process can rejoin |
| `POST /v1/jobs`               | Idempotent `{id, spec}` submission             |
| `GET /v1/jobs`                | List durable run records                       |
| `GET /v1/jobs/{id}`           | Inspect one run                                |
| `DELETE /v1/jobs/{id}`        | Cancel queued/running work                     |
| `POST /v1/jobs/claim`         | Claim compatible work using `{runner}`         |
| `POST /v1/jobs/{id}/renew`    | Renew `{runner, claim}` ownership              |
| `POST /v1/jobs/{id}/complete` | Publish `{ownership, result}`                  |

| Environment variable           | Option / purpose                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `FLUENTCI_CLUSTER_TOKEN`       | `--token`; optional on the server (random token generated when unset), required on clients; at least 32 non-space ASCII characters |
| `FLUENTCI_CLUSTER_API`         | `--api`; defaults to `http://127.0.0.1:6080`                                                                                       |
| `FLUENTCI_CLUSTER_STATE`       | `--state`; `etcd` or `consul`                                                                                                      |
| `FLUENTCI_CLUSTER_STATE_URL`   | `--state-url`; backend HTTP(S) origin                                                                                              |
| `FLUENTCI_CLUSTER_STATE_TOKEN` | `--state-token`; Consul ACL token or etcd authentication token                                                                     |
| `FLUENTCI_CLUSTER_NAME`        | `--name` on `serve`; defaults to `default`                                                                                         |
| `FLUENTCI_CLUSTER_LISTEN`      | `--listen` on `serve`; defaults to `127.0.0.1:6080`                                                                                |

State lives below `fluentci/clusters/<name>/`. Consul ACLs need session write and
read/write access to that prefix; etcd permissions need lease grant and
range/put/delete/transaction access to that prefix. Use backend origins without
embedded credentials or path prefixes. HTTPS uses Rustls certificate validation.
Expired backend auth tokens must be rotated through the API service environment.
Set `RUST_LOG=fluentci::cluster=debug` for diagnostics.

## Verification

```sh
cargo test --release --locked --lib cluster::
FLUENTCI_TEST_ETCD_URL=http://127.0.0.1:2379 \
  cargo test --release --locked --lib cluster::tests::etcd_cluster_lifecycle -- --ignored
FLUENTCI_TEST_CONSUL_URL=http://127.0.0.1:8500 \
  cargo test --release --locked --lib cluster::tests::consul_cluster_lifecycle -- --ignored
```

The backend suites exercise two API replicas, concurrent claims, submission
idempotency, ownership rejection, expiry, cancellation, durable results, and
membership refresh across the original lease's expiry. Unit tests use a fake
bsdkrun executable to check VM cleanup before result publication. They do not
invoke the FluentCI CLI.

Protocol references: [etcd JSON gateway](https://etcd.io/docs/v3.6/dev-guide/api_grpc_gateway/),
[Consul sessions](https://developer.hashicorp.com/consul/api-docs/session), and
[Consul transactions](https://developer.hashicorp.com/consul/api-docs/txn).
