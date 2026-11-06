# Module download proxy

A Cloudflare Worker in front of `https://mod.fluentci.io`. Its custom domain is
`modules.fluentci.io`. Only the origin changes: the encoded path, query string,
method, headers and request body pass through. The original upstream response is
returned without buffering or modifying its status, headers, body, or caching.

After a successful full `GET` (HTTP 200) of a versioned module path such as
`/@alice.example/sccache/v0.1.0/sccache.wasm`, the Worker uses `ctx.waitUntil` to
notify `io.fluentci.registry.recordDownload`. HEAD, partial/range responses,
redirects, errors and other paths do not increment counters. Parsing a path for
analytics never rewrites the proxied URL. Both `v0.1.0` and `0.1.0` folders are
recognized; the version sent to the API is bare SemVer.

Tracking is best effort and never blocks or changes the download response. The
Worker retries a failed/5xx/429 report once using the same UUID. Each attempt has
a five-second timeout. The API authenticates a private bearer token and atomically
inserts an idempotency event, increments the version total and upserts its UTC
daily bucket. Replayed events cannot increment either counter again. No client IP
or user identity is sent to the tracking API. Counts represent served responses,
not unique people or confirmation that the entire file was consumed.

## Configure and deploy

```sh
bun install --frozen-lockfile --ignore-scripts
# Generate a secret; do not commit it.
openssl rand -hex 32
cd apps/modules
bunx wrangler secret put DOWNLOAD_TRACKING_TOKEN
```

Set the **same** `DOWNLOAD_TRACKING_TOKEN` on the API server and restart its
service. It accepts 32–512 printable non-whitespace ASCII characters. If unset,
the tracking endpoint stays disabled; the rest of the API remains available.
Deploy the API with migration `0010_download_events` before deploying the Worker.

`wrangler.jsonc` defines the custom domain and the public API tracking endpoint in
`DOWNLOAD_API_URL`. The upstream storage origin is fixed in the Worker so neither
request paths nor client-supplied values can select another proxy destination.

```sh
bun run typecheck
bun run lint
bun run test
bun run build   # Wrangler dry run; does not publish
bun run deploy
```

Use `S3_PUBLIC_URL=https://modules.fluentci.io` in the API to publish **new** Wasm
URLs through this proxy. Keep `mod.fluentci.io` pointing directly to storage so
upstream requests cannot recurse. Existing records still pointing directly to
`mod.fluentci.io` bypass the Worker until their authors update their URL in PDS.
Do not attach this Worker to the upstream storage hostname.

For local development, copy `.dev.vars.example` to `.dev.vars` and supply the
shared token. `bun run dev` starts Wrangler. Tests use Node 24's TypeScript stripping
and mocked fetches; they do not invoke FluentCI or contact storage/the live API.
