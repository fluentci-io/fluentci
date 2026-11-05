---
title: "Services"
description: "Supervise CI databases and background processes on the host, in development environments, or in Docker."
section: "Build pipelines"
url: "/guides/services/"
source: "guides/services.md"
---

## Built-in process manager

FluentCI supervises workspace services itself: no Overmind, tmux, or
process-compose daemon is required. The manager uses Unix sockets, process
groups, and POSIX signals on macOS, Linux, FreeBSD, NetBSD, and OpenBSD.
Environment backends still require their own executable and platform support;
for example, Docker on BSD generally needs a reachable Docker daemon elsewhere.

Services can come from `[[services]]` in `fluentci.toml`, Procfiles, or code using
the JSON API. Run programs in the foreground: FluentCI owns their lifecycle.

## Declare a service

```toml
[[services]]
name = "redis"
backend = "host"
command = ["redis-server", "--save", "", "--appendonly", "no", "--port", "6379"]
readiness = { type = "tcp", address = "127.0.0.1:6379" }
health = { type = "exec", command = ["redis-cli", "ping"] }
restart = "on_failure"
max_restarts = 3
startup_timeout_ms = 30000
stop_timeout_ms = 5000
```

```sh
fluentci up
fluentci ps
fluentci services status --json
fluentci logs redis --tail 100
fluentci logs redis --follow
fluentci status redis
fluentci restart redis
fluentci stop redis
fluentci down
```

`start` is idempotent; `restart` replaces the process. `stop` also stops services
that depend on the selected service. `down` stops the workspace's services in
reverse dependency order and shuts down its manager. Other workspaces are isolated.
`echo NAME` remains a shorthand for following logs.

## Development environments

Set `backend` to `host`, `nix`, `devbox`, `devenv`, `pkgx`, or `docker`. All backends
use the same readiness, dependency, log, and restart handling.

```toml
[[services]]
name = "postgres"
backend = "devbox"
working_directory = "."
env = { PGDATA = ".fluentci/postgres", PGPORT = "55432" }
setup = "test -f \"$PGDATA/PG_VERSION\" || initdb -D \"$PGDATA\""
command = ["postgres"]
readiness = { type = "exec", command = ["pg_isready", "-p", "55432"] }
```

Add PostgreSQL to `devbox.json` first. `devenv` similarly runs commands inside
`devenv shell`; database setup and foreground commands can use its environment.
FluentCI owns these processes rather than delegating supervision to another
manager. `setup` runs in the same environment before each start and should be
idempotent. Database initialization and persistent data paths remain explicit.

For Nix, `packages = ["nixpkgs#postgresql"]` uses `nix shell`; with no packages,
`flake = "."` selects `nix develop`. pkgx accepts
`packages = ["redis.io"]` and runs the command in that package environment.

## Containers and allocated ports

```toml
[[services]]
name = "redis"
backend = "docker"
image = "redis:7-alpine"
ports = ["6379"]
readiness = { type = "exec", command = ["redis-cli", "ping"] }

[[services]]
name = "worker"
command = ["node", "worker.mjs"]
depends_on = ["redis"]
env = { REDIS_URL = "redis://${services.redis.ports.6379}" }
```

A bare container port requests a random loopback host port. Use
`ports = ["16379:6379"]` for an explicit mapping. JSON status reports actual
bindings. Dependency environment values can reference
`${services.NAME.ports.PORT}`; a service's own probes can use `${port:PORT}`,
for example `address = "${port:6379}"` or
`url = "http://${port:8080}/health"`.

Docker exec probes run inside the owned container. Optional `volumes` are passed
as literal Docker mount specifications. Containers use unique names and `--rm`;
shutdown stops and removes only FluentCI's owned container. Environment secret
values are inherited by the Docker CLI instead of included in its argument list.

## Dependencies, readiness, and recovery

`depends_on` is validated as an acyclic graph. Dependencies start first and must
pass their readiness checks before dependents start. Supported probes are:

```toml
readiness = { type = "exec", command = ["pg_isready"] }
# Or: { type = "tcp", address = "127.0.0.1:5432" }
# Or: { type = "http", url = "http://127.0.0.1:8080/health", status = 200 }
```

Each probe attempt has a two-second limit. Startup has a configurable overall
timeout. Failed startup rolls back services newly started by that request;
already running services remain owned by their existing users.

Optional `health` probes run after startup; three consecutive failures trigger
service failure handling. Restart policies are `never` (default), `on_failure`,
and `always`, bounded by `max_restarts`. `restart_backoff_ms` defaults to 250 ms;
crash retries back off up to 30 seconds. Dependents wait when a dependency is lost.

Shutdown sends SIGTERM to the owned process group, waits `stop_timeout_ms`, then
uses SIGKILL when necessary. Docker services receive a container stop first.
Stdout and stderr are captured together in per-service logs with rotation:
`log_max_bytes` defaults to 5 MiB, with three rotated files retained.

## Scoped CI services

```sh
fluentci services run -- cargo test --release --locked
fluentci services run --service redis -- bun test
```

The command waits for readiness and releases services on success, failure, or
Ctrl-C. Shared leases prevent one scoped command from stopping services still
used by another. Services started manually with `up` remain running afterward.
The wrapped command's nonzero exit status is preserved after cleanup.
It receives `FLUENTCI_SERVICES` as JSON plus allocated-port variables such as
`FLUENTCI_SERVICE_REDIS_HOST_6379`, `FLUENTCI_SERVICE_REDIS_PORT_6379`, and
`FLUENTCI_SERVICE_REDIS_ADDRESS_6379`.

## Procfiles

The manager reads root `Procfile`, `.fluentci/Procfile`, and
`.fluentci/*/Procfile`:

```text
clock: sh -c 'while true; do date; sleep 10; done'
```

Commands run through POSIX `sh` in the Procfile's directory. TOML definitions can
override a Procfile service with the same name to add probes or environments.
After editing a running configuration, use `down` and `up` to reload it.

## Define services from code

```sh
fluentci services apply --json '[{"name":"redis","backend":"docker","image":"redis:7-alpine","ports":["6379"],"readiness":{"type":"exec","command":["redis-cli","ping"]}}]'
fluentci services apply --file services.json
cat services.json | fluentci services apply --file -
```

The JSON payload is an array using the same fields as TOML definitions. Native
Rust integrations can call `fluentci::services::apply` and `status`; any SDK can
invoke the JSON CLI through its host exec primitive. Applying a changed definition
requires stopping that service first. JSON responses contain lifecycle states,
PIDs, restart counts, exit codes, and allocated ports.

## Pipeline-local services

Native host plans also support service tasks with readiness, health, dependencies,
and cleanup scoped to one plan. These remain available through every SDK's plan
builders. Use [native plans](/guides/native-plans/) for service tasks within a
single pipeline; use the workspace manager when services span commands.
