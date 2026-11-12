# FluentCI registry API

The API targets Node.js and validates its environment before opening SQLite,
connecting to Jetstream, or listening for requests. Invalid configuration exits
with status 1 and lists every problem without printing secret values.

`GET /` shows the FluentCI ASCII welcome page, site/documentation links, and the
`/xrpc` API prefix. Browsers receive HTML; command-line clients receive plain text.
`GET /xrpc/_health` returns `{ "status": "ok" }` for liveness checks; `/health`
remains available for existing probes.

`GET /xrpc/io.fluentci.registry.getActorPackages?actor=alice.example&limit=20`
returns an actor's indexed published versions. `actor` accepts a handle or DID;
`limit` is 1–100 (default 20), and `cursor` continues the selected ordering.
The response also includes `totalDownloads`: the actor’s downloads across all
visible module versions, independent of search, sort order, and pagination.
Use `latest=true` on listing, search, or actor-package queries to select one
release per publisher and module before filtering, sorting, and pagination. This
uses the highest stable SemVer, falling back to the highest prerelease when no
stable version exists. For these module-level listings, downloads are summed across all versions from
the same publisher; sorting and cursors use that total. Omit `latest` to browse
individual published versions with their own download counts.

`getActorPackages`, `listPackages`, and `searchPackages` accept `sort=downloads`
(default), `sort=newest`, `sort=oldest`, or `sort=name` (A–Z). Sort order is applied
before pagination; cursors are bound to the query and sort option. Changing sort
requires starting a new page sequence. Deleted records and inactive publishers are excluded. Optional `logo` URLs
are included in plugin records and every package response.

Uploads can provide `name` and a bare SemVer `version` as query parameters. The
API resolves the authenticated DID's verified handle and returns a public URL
such as `https://mod.fluentci.io/@alice.example/hello-ci/v1.0.0/hello-ci.wasm`.
Conditional S3 writes reject overwrites of that publisher/module/version.
Requests without either parameter retain content-addressed storage for older
clients. The current CLI supplies both values from package metadata.

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

Plugin records support optional `topics`, `os`, `arch`, and `readmeUrl` metadata.
Pkl definitions generate the JSON lexicons, runtime schemas, and Gleam encoders.
Jetstream indexes author-owned `create` and `update` commits, so metadata edited
directly in the publisher PDS appears in registry queries. Record keys must
continue to match `name-version`; deduplication and event ordering prevent stale
revisions from overwriting newer metadata.

Migration `0008_plugin_classification` stores these fields and reserves a
nonnegative `downloads` counter with a default of zero. Publisher metadata and
Jetstream updates cannot reset that counter. The authenticated proxy endpoint
updates totals and daily buckets independently of published metadata. Existing
records remain valid when the optional fields are absent.

| Variable                                     | Requirement / default                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `S3_BUCKET`                                  | Required for the server: destination bucket                                              |
| `S3_PUBLIC_URL`                              | Required for the server: public HTTPS download base URL                                  |
| `S3_REGION`                                  | Optional; falls back to `AWS_REGION`, then `us-east-1`                                   |
| `S3_ENDPOINT`                                | Optional HTTPS endpoint for S3-compatible storage                                        |
| `S3_FORCE_PATH_STYLE`                        | Optional `true` or `false`; defaults to `false`                                          |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Set both or neither; otherwise the AWS SDK credential provider chain applies             |
| `HOST`                                       | Defaults to `127.0.0.1`                                                                  |
| `PORT`                                       | Integer from 1–65535; defaults to `3001`                                                 |
| `DATABASE_URL`                               | Local SQLite file URL; defaults to `file:./data/registry.sqlite`, relative to `apps/api` |
| `SERVICE_DID`                                | Valid `did:web` or `did:plc`; defaults to `did:web:api.fluentci.io`                      |
| `JETSTREAM_URLS`                             | Comma-separated WSS endpoints; defaults to all four public US East/West instances        |
| `JETSTREAM_URL`                              | Legacy single-endpoint override, used when `JETSTREAM_URLS` is unset                     |
| `JETSTREAM_ENABLED`                          | Optional `true` or `false`; defaults to `true`                                           |

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

| Directory                     | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `src/fluentci_api/xrpc/`      | Central route registration and one handler per endpoint under `io/fluentci/registry/` |
| `src/fluentci_api/node/`      | Node HTTP, XRPC transport, authentication and S3 bindings                             |
| `src/fluentci_api/db/`        | Gleam application queries, transactions, SQLite lifecycle and cursor encoding         |
| `src/fluentci_api/drizzle/`   | Typed Drizzle bindings and a generic JavaScript execution bridge                      |
| `src/fluentci_api/schema/`    | Gleam table definitions, indexes, typed columns and row decoders                      |
| `src/fluentci_api/jetstream/` | Jetstream validation, subscription and indexing                                       |
| `src/fluentci_api/lexicon/`   | Generated Gleam models, encoders and runtime schemas                                  |
| `pkl/schema/`                 | Typed Pkl Lexicon schema                                                              |
| `pkl/defs/`                   | Authoritative FluentCI Lexicon definitions                                            |
| `drizzle/`                    | SQLite migrations                                                                     |

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

### Registry filters and download statistics

`io.fluentci.registry.searchPackages` accepts an optional `filter` containing RSQL.
`q` is optional so filters can be used alone, or combined with FTS text search:

```text
/xrpc/io.fluentci.registry.searchPackages?q=cache&filter=os==linux;arch=in=(aarch64,x86_64)
```

Supported fields: `os`, `arch`, `topics`, `name`, `version`, `license`, and `author`
(the publisher DID). Supported operators: `==`, `!=`, `=in=`, and `=out=`. Use `;`
for AND, `,` for OR, and parentheses to group. Array comparisons match an element;
missing arrays match exclusions. Values are exact, case-sensitive, and bound as
SQL parameters. Unsupported fields/operators, wildcards, invalid syntax, and
oversized/deep expressions return `InvalidFilter`. Cursors are bound to text,
author, and filter. URL-encode the filter when sending requests.

Registry views expose the server-owned `downloads` count for each published
version. `getPackage` also returns `dailyDownloads` when tracked history exists:
seven UTC calendar days including today, with missing days filled with zeros.
It omits this field when no samples exist in the window. Publishers cannot set
counters through PDS metadata. All API routes allow cross-origin requests from any origin, including OPTIONS
preflight and Authorization/custom headers. Cookie credentials are not enabled.

Migration `0009_daily_downloads` prepares `plugin_download_days`, uniquely keyed
by record URI and UTC date with a nonnegative count. The authenticated download endpoint and `apps/modules` proxy maintain these
counters atomically. Metadata updates preserve both.

### Authenticated download recording

The `apps/modules` Cloudflare Worker reports successful full Wasm GETs to
`POST /xrpc/io.fluentci.registry.recordDownload`. Configure a shared private
`DOWNLOAD_TRACKING_TOKEN` (32–512 non-whitespace printable ASCII characters) on
the API and as a Worker secret. An unset token disables only this endpoint.
The endpoint is unrelated to publisher AT Protocol service authentication.

```json
{
  "eventId": "6df623ac-e2d7-45b5-82bc-014223032a41",
  "handle": "alice.example",
  "name": "sccache",
  "version": "0.1.0"
}
```

Send `Authorization: Bearer <DOWNLOAD_TRACKING_TOKEN>`. `eventId` must be a UUID
v4. The server resolves the handle to the indexed author, requires an existing
visible version, and uses its own UTC date. The response is
`{"recorded":1,"downloads":42}`, or `recorded:0` for a replay. A single transaction
updates `plugin_download_events`, `plugin_download_days`, and the total; failures
roll back all three. Writes sharing a SQLite connection are serialized across
HTTP handlers and Jetstream. Publisher metadata updates cannot change counters.
See [Worker deployment instructions](../modules/README.md) for origin routing and
how to publish download URLs through the proxy.

## Indexer recovery

Local SQLite uses the official `drizzle-orm/node-sqlite` driver and one persistent
`node:sqlite` connection. Drizzle is pinned to `1.0.0-rc.5`, which provides this
driver. The native transaction callback is synchronous; the generic Gleam bridge
keeps transactions open until its promise-based queries finish, and serializes
unrelated reads and writes. Migrations use Drizzle 1 folder layout and preserve
existing migration hashes; the driver upgrades legacy migration history in place.
Reads and transactions share a queue, so HTTP queries cannot interfere with an
index transaction. Each Jetstream endpoint has a live subscription starting at
the current head and a separate historical subscription resuming its durable
checkpoint. Live reconnects resume their own checkpoint; process startup starts
a fresh live stream while historical replay fills any outage gap. Both paths
deduplicate revisions and reject older metadata, so backlog cannot delay fresh
PDS edits or overwrite them later.

Jetstream pauses its sockets while replay queues drain, sends
heartbeats, and exits if ingestion hangs for 60 seconds. The systemd service's
`Restart=on-failure` policy then reopens SQLite and resumes durable checkpoints.

To reconcile a publisher directly from their PDS after an extended outage:

```sh
DATABASE_URL=file:/var/lib/fluentci/registry.sqlite node scripts/reindex-actor.mjs did:plc:ACCOUNT
```

The script resolves the DID's PDS, reads its public records, validates ownership
and lexicon metadata, and uses the normal Gleam indexer. Its checkpoint is separate
from live Jetstream cursors. Existing immutable artifact identities and download
counts remain protected.

## Upload reliability

XRPC accepts identity or gzip-encoded Wasm request bodies. Its existing 64 MiB
limit applies after decompression, and checksums, validation, and S3 storage use
the original Wasm bytes. The CLI compresses large uploads when beneficial, allows
ten minutes per attempt, and retries transient failures with fresh scoped tokens.

S3 writes retain `If-None-Match: *`. When an object already exists, the API verifies
its digest, size, and stored publisher metadata before returning the same URL for
an identical retry. Older objects without digest metadata are streamed and hashed;
ETags are never trusted as SHA-256. Different artifacts still return HTTP 409.
Storage calls have a 45-second deadline, connection establishment has a ten-second
deadline, and the SDK uses at most two attempts. HTTP receipt allows eleven minutes
for slow clients; identity resolution has a ten-second timeout.

Structured `publish_request`, `module_upload`, and failure logs record wire bytes,
encoding, completion, and elapsed receive/validation/publisher/storage time. Tokens
and request headers are never logged.

## Module likes

`io.fluentci.like` is defined in Pkl and generated with the other lexicons. Browser
OAuth clients write and delete these records directly on their own PDS. The API
accepts no like mutation endpoint or browser OAuth tokens. Jetstream subscribes
to both plugin and like collections, deduplicates events transactionally, and
retains timestamp-ordered unlike tombstones. Module views include `likesCount`
across versions; inactive likers are excluded. Plugin deletion retention does
not apply to likes: deleting a like removes it from the active count.
