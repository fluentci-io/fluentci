---
title: "Deploy the cache server"
description: "Deploy fluentci-cache with systemd, S3 or R2, a public CDN, account upload tokens, and owner storage management."
section: "Contribute and deploy"
url: "/development/build-cache/"
source: "development/build-cache.md"
---

## Build the standalone server

The cache lives in `cache/` with its own Cargo manifest and lockfile. Build for
the target Linux architecture using Rust 1.90 or newer and the Protocol Buffers
compiler (`protoc`; `apt install protobuf-compiler` on Debian/Ubuntu):

```sh
cargo build --release --locked --manifest-path cache/Cargo.toml
```

The binary is `cache/target/release/fluentci-cache`. This standalone build does
not need Studio assets or a build of the FluentCI CLI.

## Configure S3 or R2 and the public CDN

Create the bucket before starting the service. For S3-compatible storage, the
server writes with AWS credentials and reads anonymously through the public CDN.
Grant the storage identity list, write, delete, and multipart upload/abort access
to the selected bucket and prefix. Owner browsing and storage cleanup require
list and delete permissions.

Configure `/etc/fluentci/cache.env` with mode `0600`:

```sh
FLUENTCI_CACHE_BACKEND=s3
FLUENTCI_CACHE_BIND=127.0.0.1:8080
FLUENTCI_CACHE_BUCKET=your-bucket
FLUENTCI_CACHE_REGION=auto
FLUENTCI_CACHE_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
FLUENTCI_CACHE_CDN_URL=https://cache-cdn.fluentci.io
FLUENTCI_CACHE_PREFIX=fluentci-cache/v1
FLUENTCI_CACHE_PUBLIC_READ=true
FLUENTCI_CACHE_STAGING_DIRECTORY=/var/lib/fluentci-cache/uploads
FLUENTCI_CACHE_STAGING_LIMIT=21474836480
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
FLUENTCI_CACHE_TOKEN=YOUR_RANDOM_ADMIN_SECRET
FLUENTCI_CACHE_UPLOAD_TOKEN_PUBLIC_KEY_FILE=/etc/fluentci/cache-upload-public.pem
FLUENTCI_CACHE_UPLOAD_TOKEN_ISSUER=did:web:api.fluentci.io
RUST_LOG=fluentci_cache=info
```

This example targets R2. For AWS S3, omit the endpoint and use the bucket's AWS
region. Machine roles can replace static AWS credentials. Temporary credentials
also require `AWS_SESSION_TOKEN`.

Generate the administrator secret with `openssl rand -hex 32`. It controls
operations endpoints and legacy shared-cache access; keep it separate from user
upload tokens. The endpoint variable is `FLUENTCI_CACHE_ENDPOINT`.

The CDN URL points at the bucket root, before the configured storage prefix.
It must support GET, HEAD, byte ranges, and 404 responses for missing objects.
Never use the cache service's own URL as its read origin. For production,
`cache.fluentci.io` serves the cache while `cache-cdn.fluentci.io` serves R2.
Account objects map to:

```text
<prefix>/accounts/<owner-did-sha256>/<protocol>/<key>
```

Client tokens and AWS credentials are not forwarded to the CDN. Reads do not
fall back to authenticated S3. Configure revalidation or short cache lifetimes
for mutable keys and disable negative caching. Uploads and origin deletions do
not purge cached CDN responses. Direct CDN access remains public even if public
reads are disabled on the cache server.

## Generate account-token signing keys

Run this on a trusted server:

```sh
umask 077
openssl genpkey -algorithm ED25519 -out cache-upload-private.pem
openssl pkey -in cache-upload-private.pem -pubout -out cache-upload-public.pem
```

Install the private key only on the API server, readable by its `fluentci`
service account. In the API's `/etc/fluentci/api.env`, configure:

```sh
CACHE_PUBLIC_URL=https://cache.fluentci.io
CACHE_TOKEN_PRIVATE_KEY_FILE=/etc/fluentci/cache-upload-private.pem
```

Install the public key on the cache server, readable by `fluentci-cache`.
`FLUENTCI_CACHE_UPLOAD_TOKEN_ISSUER` must match the API's `SERVICE_DID`.
Restart both services after rotating keys. Cache servers with the new public key
reject tokens signed by the previous private key. These keys sign upload JWTs;
Nix narinfo uses its own signing keys.

## Install the systemd service

From the checkout root, on Linux:

```sh
sudo useradd --system --user-group --home-dir /var/lib/fluentci-cache \
  --shell /usr/sbin/nologin fluentci-cache
sudo install -d -m 0755 /etc/fluentci
sudo install -m 0755 cache/target/release/fluentci-cache /usr/local/bin/fluentci-cache
sudo install -m 0640 -o root -g fluentci-cache \
  cache/cache.example.toml /etc/fluentci/cache.toml
sudo install -m 0600 systemd/fluentci-cache.env.example /etc/fluentci/cache.env
sudoedit /etc/fluentci/cache.toml /etc/fluentci/cache.env
sudo install -m 0644 systemd/fluentci-cache.service \
  /etc/systemd/system/fluentci-cache.service
sudo systemd-analyze verify /etc/systemd/system/fluentci-cache.service
sudo systemctl daemon-reload
sudo systemctl enable --now fluentci-cache
sudo journalctl -u fluentci-cache -f
```

Set ownership and permissions on the public key to `root:fluentci-cache` and
`0640`. On the API host, use `root:fluentci` and `0640` for the private key.
Both service accounts need permission to traverse `/etc/fluentci`.

Settings resolve in this order: defaults, TOML, environment, explicit flags.
The administrator token and S3/CDN configuration are required before starting a
writable S3 server. Defaults allow uploads up to 10 GiB, 128 active transfers,
and a 300-second transfer timeout. The unit allows 330 seconds for shutdown;
increase that deadline if increasing the transfer timeout.

For a file backend, use `FLUENTCI_CACHE_BACKEND=file` and
`FLUENTCI_CACHE_DIRECTORY=/var/lib/fluentci-cache/objects`. Systemd creates the
writable state directory. Memory storage is temporary. There is no built-in TTL,
eviction policy, or quota; configure storage lifecycle policies separately.

## Route HTTPS through Caddy

For a Caddy container using host networking, add this to its active Caddyfile:

```text
cache.fluentci.io {
    @grpc header Content-Type application/grpc*
    handle @grpc {
        reverse_proxy h2c://127.0.0.1:8080
    }
    handle {
        reverse_proxy 127.0.0.1:8080
    }
}
```

The production path is `/pds/caddy/etc/caddy/Caddyfile`. Validate and reload:

```sh
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

The root returns the FluentCI Cache ASCII welcome message and documentation
link. Keep the listener on loopback and let Caddy handle HTTPS.

## Verify a deployment

```sh
curl --fail https://cache.fluentci.io/healthz
curl --fail -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://cache.fluentci.io/readyz
```

`/healthz` tests liveness. `/readyz` probes the storage and CDN but does not prove
write permissions. `/metrics` requires the administrator token when configured.
Verify an account-token PUT, an anonymous cache GET, a direct CDN GET, and owner
listing/deletion using a dedicated probe key. Remove that probe afterward.

Deploy the API changes and migrations as described in
[registry deployment](/development/registry/). Use the
[cache page](/registry/cache/) to generate account tokens and invite users.
For upgrades, stage a new binary as `/usr/local/bin/fluentci-cache.new`, rename
it over the installed binary, then restart `fluentci-cache`. Keep configuration,
keys, and persistent storage separate from the binary.

## Usage history

The API records daily storage-byte and object-count snapshots for each owner who
lists their cache. Install the provided timer on the API host to record snapshots
hourly between page visits:

```sh
sudo install -m 0644 systemd/fluentci-cache-usage.service /etc/systemd/system/
sudo install -m 0644 systemd/fluentci-cache-usage.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fluentci-cache-usage.timer
sudo systemctl start fluentci-cache-usage.service
```

The job shares the API's environment and SQLite database, and uses
`/opt/fluentci-runtime/node` by default. Override the runtime path if necessary.
The cache page displays the latest sample from each of the last 14 UTC days.
It does not invent data for dates before measurements began. Direct CDN request
counts and edge cache hit rates need separate Cloudflare analytics; S3 metadata
and these storage snapshots cannot measure them.
