# FluentCI registry API

The API targets Node.js and validates its environment before opening SQLite,
connecting to Jetstream, or listening for requests. Invalid configuration exits
with status 1 and lists every problem without printing secret values.

From the repository root, install dependencies with
`bun install --frozen-lockfile --ignore-scripts`. With Gleam and Node.js 24 or
newer installed:

```sh
cd apps/api
cp .env.example .env
# Configure your bucket and public download URL in .env.
bun run dev
```

The server loads `apps/api/.env`; existing environment variables take precedence.
`bun run jetstream` runs only the indexer and does not require upload settings.

| Variable | Requirement / default |
| --- | --- |
| `S3_BUCKET` | Required for the server: destination bucket |
| `S3_PUBLIC_URL` | Required for the server: public HTTPS download base URL |
| `S3_REGION` | Optional; falls back to `AWS_REGION`, then `us-east-1` |
| `S3_ENDPOINT` | Optional HTTPS endpoint for S3-compatible storage |
| `S3_FORCE_PATH_STYLE` | Optional `true` or `false`; defaults to `false` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Set both or neither; otherwise the AWS SDK credential provider chain applies |
| `HOST` | Defaults to `127.0.0.1` |
| `PORT` | Integer from 1–65535; defaults to `3001` |
| `DATABASE_URL` | Local SQLite file URL; defaults to `file:./data/registry.sqlite`, relative to `apps/api` |
| `SERVICE_DID` | Valid `did:web` or `did:plc`; defaults to `did:web:api.fluentci.io` |
| `JETSTREAM_URLS` | Comma-separated WSS endpoints; defaults to all four public US East/West instances |
| `JETSTREAM_URL` | Legacy single-endpoint override, used when `JETSTREAM_URLS` is unset |
| `JETSTREAM_ENABLED` | Optional `true` or `false`; defaults to `true` |

HTTP and WS URLs are allowed for loopback development services. Storage URLs
must not contain credentials, query strings, or fragments. In-memory databases
are unsupported: records and replay checkpoints must persist on disk.

Run `bun run lint`, `bun run typecheck`, and `bun run test` to validate the API.
Use `bun run format` to format Gleam and all JavaScript bindings, scripts and
tests. Lint checks Prettier formatting, including generated JavaScript.

## Lexicons and generated code

All `io.fluentci.*` lexicons are defined in `pkl/defs/io/fluentci/`, using the
typed schema in `pkl/schema/lexicon.pkl`. Install the Pkl CLI alongside Gleam to
generate artifacts:

```sh
bun run lexicons:generate
bun run lexicons:check
```

Generation evaluates Pkl, validates the complete set with AT Protocol's Lexicon
validator, and writes JSON to `lexicons/`, Gleam types and JSON encoders to
`src/fluentci_api/lexicon/models.gleam`, and the JavaScript runtime schema bundle
to `src/fluentci_api/lexicon/schemas.mjs`. Commit these generated files together
with their Pkl sources; edit the Pkl definitions rather than generated artifacts.
`lexicons:check` fails if generated files are missing, stale, or have no Pkl
source. Builds regenerate them automatically, and lint checks for drift.

## Source layout

| Directory | Purpose |
| --- | --- |
| `src/fluentci_api/xrpc/` | Central route registration and one handler per endpoint under `io/fluentci/registry/` |
| `src/fluentci_api/node/` | Node HTTP, XRPC transport, authentication and S3 bindings |
| `src/fluentci_api/db/` | Gleam application queries, transactions, SQLite lifecycle and cursor encoding |
| `src/fluentci_api/drizzle/` | Typed Drizzle bindings and a generic JavaScript execution bridge |
| `src/fluentci_api/schema/` | Gleam table definitions, indexes, typed columns and row decoders |
| `src/fluentci_api/jetstream/` | Jetstream validation, subscription and indexing |
| `src/fluentci_api/lexicon/` | Generated Gleam models, encoders and runtime schemas |
| `pkl/schema/` | Typed Pkl Lexicon schema |
| `pkl/defs/` | Authoritative FluentCI Lexicon definitions |
| `drizzle/` | SQLite migrations |

For Linux deployment, see [the systemd service instructions](../../systemd/README.md).

## Redundant Jetstream indexing

By default the indexer connects concurrently to these [public Jetstream instances](https://github.com/bluesky-social/jetstream-legacy#public-instances):

- `wss://jetstream1.us-east.bsky.network/subscribe`
- `wss://jetstream2.us-east.bsky.network/subscribe`
- `wss://jetstream1.us-west.bsky.network/subscribe`
- `wss://jetstream2.us-west.bsky.network/subscribe`

Override the complete set in `.env` (or the systemd environment file):

```sh
JETSTREAM_URLS=wss://jetstream1.us-east.bsky.network/subscribe,wss://jetstream1.us-west.bsky.network/subscribe
```

Duplicate URLs connect only once. Each source has its own durable SQLite cursor,
independent reconnect backoff and a ten-second replay overlap. A slow or failed
source does not advance another source's cursor. Incoming writes are serialized;
queue overflow or indexing failure reconnects the affected source from its last
committed checkpoint while the remaining sources continue.

Commit identity uses the publisher DID, collection, record key, operation and
repository revision. Account events use their publisher DID and sequence/status.
Events without revision or sequence fall back to their timestamp. Deduplication
identities, record changes and source checkpoints commit in one transaction, so
replays remain safe after restarts and failed writes can be retried. The durable
deduplication ledger retains indexed event identities.

Multiple connections improve availability; events outside the upstream replay
retention window still require a separate backfill.

## Plugin identity and full-text search

A plugin is identified by publisher plus name, for example `alice.example/build`.
Handles resolve to canonical DIDs: changing a handle preserves package identity.
Different publishers can use the same plugin name, and one publisher can release
multiple versions. SQLite enforces uniqueness of `(author DID, name, version)`;
records must also use the canonical `name-version` record key.

Search uses SQLite FTS5 over plugin names and descriptions, with Unicode token
prefixes and accent-insensitive matching. Multiple words are combined with AND;
query text is treated literally and bound as a parameter, rather than accepted as
raw FTS syntax. Results preserve cursor pagination and publisher filtering, and
exclude deleted records and inactive accounts. For example, `rust comp` matches a
plugin named `rust-build` whose description contains `compiler`.

Migrations create and backfill the FTS5 index for existing databases. SQLite
triggers maintain it inside the same transactions as plugin writes. The SQLite
runtime must support FTS5 (the bundled libSQL runtime does).
