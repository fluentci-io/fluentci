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
| `JETSTREAM_URL` | WSS endpoint; defaults to `wss://jetstream2.us-east.bsky.network/subscribe` |
| `JETSTREAM_ENABLED` | Optional `true` or `false`; defaults to `true` |

HTTP and WS URLs are allowed for loopback development services. Storage URLs
must not contain credentials, query strings, or fragments. In-memory databases
are unsupported: records and replay checkpoints must persist on disk.

Run `bun run lint`, `bun run typecheck`, and `bun run test` to validate the API.
