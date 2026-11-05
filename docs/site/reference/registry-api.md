---
title: "Registry XRPC API"
description: "Search, paginate, resolve and upload FluentCI Wasm plugins through io.fluentci endpoints."
section: "Reference"
url: "/reference/registry-api/"
source: "reference/registry-api.md"
---

## API origin and records

The default CLI registry origin is `https://api.fluentci.io`. Deployments can use
another origin. A record is published to the user's PDS under `io.fluentci.plugin`
with record key `name-version`. Its author must match the repository DID.

Package views include record `uri`, `cid`, `name`, `description`, `version`,
`publishedAt`, `author`, `license`, `url`, `sha256`, and `size`.

`GET /` displays the FluentCI ASCII welcome page with website and documentation
links. API methods are under `/xrpc`.

`GET /xrpc/_health` returns `{ "status": "ok" }` when the HTTP application is running.
`GET /health` remains available as a compatibility alias.
It is a liveness check, not a test of S3 permissions or Jetstream connectivity.

## Search packages

`GET /xrpc/io.fluentci.registry.searchPackages` accepts:

| Parameter | Contract                           |
| --------- | ---------------------------------- |
| `q`       | Required text, 1–200 characters    |
| `author`  | Optional handle or DID             |
| `limit`   | 1–100, default 20                  |
| `cursor`  | Optional opaque query-bound cursor |

```sh
curl -sS --get https://api.fluentci.io/xrpc/io.fluentci.registry.searchPackages \
  --data-urlencode 'q=rust comp' \
  --data-urlencode 'limit=20'
```

The response contains `packages` and an optional `cursor`. FTS5 token-prefix
search covers names and descriptions, normalizes accents, combines words with
AND, and excludes deleted records and inactive authors. Results retain stable
publication-time/URI pagination rather than exposing arbitrary FTS syntax.

## List and resolve

`GET /xrpc/io.fluentci.registry.listPackages` accepts `author`, `limit`, and
`cursor`, without `q`, and returns the same page shape.

`GET /xrpc/io.fluentci.registry.getPackage` requires `name` and optionally accepts
`version` and `author`. It returns `{ "package": ... }`. Supply the publisher
when multiple authors share a name. Without a version it selects the latest
stable SemVer, falling back to a prerelease only if no stable release exists.

Errors include `PackageNotFound`, `AmbiguousPackage`, and `InvalidCursor`.
Cursors belong to their original search/filter; do not reuse one with a changed
query or author. The SQL constraint prevents duplicate publisher/name/version
records while allowing different publishers and new versions.

## Upload

`POST /xrpc/io.fluentci.registry.publish` receives raw `application/wasm` bytes,
not multipart form data. It requires a short-lived AT Protocol service-auth
Bearer token scoped to that method and the configured service DID. It does not
accept an app password as its upload credential.

Supply `name` and `version` together as query parameters for a versioned URL:
`https://mod.fluentci.io/@alice.example/hello-ci/v1.0.0/hello-ci.wasm`. The
server resolves and verifies the handle from the authenticated DID; callers
cannot choose another publisher's path. Metadata uses bare SemVer (`1.0.0`),
while URL version segments include `v`. Existing versioned objects cannot be
overwritten (`PackageVersionExists`). Omitting both parameters preserves legacy
content-addressed upload URLs.

```sh
curl -sS 'https://api.fluentci.io/xrpc/io.fluentci.registry.publish?name=hello-ci&version=1.0.0' \
  -H "Authorization: Bearer $SERVICE_AUTH_TOKEN" \
  -H 'Content-Type: application/wasm' \
  --data-binary @dist/plugin.wasm
```

The response contains `url`, `sha256`, and `size`. The server validates Wasm and
limits uploads to 64 MiB, then stores an immutable object in S3. Errors include
`InvalidWasm`, authentication failures, and `StorageUnavailable`. The publisher
must subsequently create the PDS record; upload alone does not publish metadata.
Use `fluentci publish` to orchestrate both steps.

## Indexing and definitions

Jetstream connections index valid plugin records into SQLite. Independent source
cursors and durable event identities make overlapping streams/replays safe.
This is asynchronous indexing, not an immediate cross-service transaction or a
complete historical backfill.

Pkl definitions in `apps/api/pkl/defs` generate JSON lexicons, Gleam models and
encoders, and the runtime schema bundle. Run `bun run lexicons:generate` or
`bun run lexicons:check` in that workspace after changing Pkl sources. See
[registry development](/development/registry/) for the implementation layout.
