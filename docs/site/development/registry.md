---
title: "Deploy the registry"
description: "Configure the Gleam Node.js API, SQLite FTS5 index, redundant Jetstreams, S3 storage, and systemd service."
section: "Contribute and deploy"
url: "/development/registry/"
source: "development/registry.md"
---

## Build and start

The API is `apps/api`, targeting Node.js rather than the Wasm guest SDK. Install
Node 24+, Bun, Gleam, and Pkl for development/builds:

```sh
bun install --frozen-lockfile --ignore-scripts
cd apps/api
cp .env.example .env
# Configure S3 values and credentials before starting.
bun run build
bun run start
```

Existing environment values override `.env`. The server validates all settings
before opening SQLite, connecting to Jetstream, or listening. Errors list
variable names and constraints without printing secret values.

## Configuration

| Variable                                     | Default / requirement                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `HOST`                                       | `127.0.0.1`                                                                |
| `PORT`                                       | `3001`; integer 1–65535                                                    |
| `DATABASE_URL`                               | `file:./data/registry.sqlite`, relative to API root; persistent local file |
| `SERVICE_DID`                                | `did:web:api.fluentci.io`; must match upload-token audience                |
| `S3_BUCKET`                                  | Required for server uploads                                                |
| `S3_PUBLIC_URL`                              | Required public HTTPS download base                                        |
| `S3_REGION`                                  | Falls back to `AWS_REGION`, then `us-east-1`                               |
| `S3_ENDPOINT`                                | Optional S3-compatible HTTPS endpoint                                      |
| `S3_FORCE_PATH_STYLE`                        | `true` or `false`; default false                                           |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Set both, or use the AWS credential provider chain                         |
| `JETSTREAM_URLS`                             | Comma-separated endpoints; defaults to four public East/West instances     |
| `JETSTREAM_URL`                              | Legacy single-source override when plural setting is unset                 |
| `JETSTREAM_ENABLED`                          | `true` or `false`; default true                                            |

HTTP/WS are allowed for loopback development. Storage URLs cannot contain
credentials, query strings, or fragments. Use a SQLite build with FTS5 support;
the bundled libSQL driver provides it. In-memory databases are unsupported.

The API can bind locally behind an HTTPS reverse proxy. The configured S3 public
base must actually serve uploaded objects: setting a URL does not create bucket
access policy or a CDN. Storage identity needs permissions to write the selected
bucket. The CLI, not this API, writes publisher PDS records.

## Jetstream and durable indexing

Default subscriptions connect to `jetstream1` and `jetstream2` in both
`us-east.bsky.network` and `us-west.bsky.network`. Each source has an independent
cursor, reconnect backoff, and ten-second replay overlap. Duplicate source URLs
connect once. SQLite writes are serialized across connections.

Commit revision identities and account sequence/status identities are persisted
with record changes and checkpoints in one transaction. Replays deduplicate even
after restarts. Failed writes roll back the identity and checkpoint so they can
be retried. Overloaded/failed sources reconnect without advancing another source's
cursor. Keep disk capacity and upstream replay retention in deployment planning;
the ledger retains indexed event identities, and full historical backfill is a
separate operation.

Run only the indexer with `bun run jetstream`. That mode does not require upload
storage settings. Avoid unintentionally starting independent indexer processes
against one database when an embedded indexer already owns the work.

## Queries, lexicons, and migrations

`src/fluentci_api/schema/` defines Gleam tables, columns, row decoders, and
indexes. `db/client.gleam` constructs application queries through imported
Drizzle functions. `drizzle/orm_ffi.mjs` is a generic execution bridge rather than
the place for business queries. FTS5 migrations backfill existing records and
triggers maintain the index transactionally.

Edit `pkl/defs/`, then run:

```sh
bun run lexicons:generate
bun run format
bun run lint
bun run test
```

Generation produces JSON lexicons, Gleam models/encoders, and runtime schemas.
Commit sources and generated files together. Prettier formats all `.mjs` bindings
and generated JavaScript.

## Linux service

The repository supplies `systemd/fluentci-api.service` and installation
instructions in `systemd/README.md`. The unit expects a built checkout at
`/opt/fluentci`, a `fluentci` system account, `/usr/bin/node`, and
`/etc/fluentci/api.env`. It stores SQLite data under `/var/lib/fluentci` and logs
to journald. Build before enabling the service; Bun/Gleam/Pkl are build tools,
not required by the running compiled server.

```sh
sudo systemctl status fluentci-api.service
sudo journalctl -u fluentci-api.service -f
```

Review paths and credentials for the target host before installing the unit.
