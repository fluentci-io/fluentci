# FluentCI API service

`fluentci-api.service` runs the Gleam Node.js XRPC API and its embedded Jetstream
indexer. It expects a built checkout at `/opt/fluentci`, Node.js 24+ at
`/usr/bin/node`, and a dedicated `fluentci` system account.

Prepare the application before starting the service (Bun, Gleam and Pkl are build
tools; they are not needed to run the built API):

```sh
cd /opt/fluentci
bun install --frozen-lockfile --ignore-scripts
cd apps/api
bun run build
```

Install the unit and configuration from the checkout root:

```sh
sudo useradd --system --user-group --home-dir /var/lib/fluentci --shell /usr/sbin/nologin fluentci
sudo install -d -m 0750 /etc/fluentci
sudo install -m 0600 apps/api/.env.example /etc/fluentci/api.env
sudoedit /etc/fluentci/api.env
sudo install -m 0644 systemd/fluentci-api.service /etc/systemd/system/fluentci-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now fluentci-api.service
sudo systemctl status fluentci-api.service
sudo journalctl -u fluentci-api.service -f
```

Set the bucket, public S3 URL and AWS credentials (or use an instance role).
Remove `DATABASE_URL` from the copied example, or set it to
`file:/var/lib/fluentci/registry.sqlite`. Systemd creates that persistent data
directory with ownership assigned to the service account. The checkout and its
dependencies must be readable by `fluentci`; the service does not write there.

The API listens on loopback port 3001 by default; put your HTTPS reverse proxy in
front of it. Startup reports all invalid environment settings before accessing
SQLite or network services. Logs go to journald and failures restart after five
seconds, up to five starts per minute.

For a different checkout location or Node.js path, run
`sudo systemctl edit fluentci-api.service` and override `WorkingDirectory` and
`ExecStart` (clear `ExecStart` before setting its replacement). After deploying
and rebuilding updates, run `sudo systemctl restart fluentci-api.service`.


## Build cache service

`fluentci-cache.service` runs the standalone cache binary as its own system user.
Build on the target Linux architecture (the Studio assets are not needed):

```sh
cargo build --release --locked --manifest-path cache/Cargo.toml
sudo useradd --system --user-group --home-dir /var/lib/fluentci-cache --shell /usr/sbin/nologin fluentci-cache
sudo install -d -m 0755 -o root -g root /etc/fluentci
sudo install -m 0755 cache/target/release/fluentci-cache /usr/local/bin/fluentci-cache
sudo install -m 0640 -o root -g fluentci-cache cache/cache.example.toml /etc/fluentci/cache.toml
sudo install -m 0600 systemd/fluentci-cache.env.example /etc/fluentci/cache.env
sudoedit /etc/fluentci/cache.toml /etc/fluentci/cache.env
sudo install -m 0644 systemd/fluentci-cache.service /etc/systemd/system/fluentci-cache.service
sudo systemd-analyze verify /etc/systemd/system/fluentci-cache.service
sudo systemctl daemon-reload
sudo systemctl enable --now fluentci-cache.service
curl --fail http://127.0.0.1:8080/healthz
sudo journalctl -u fluentci-cache.service -f
```

Provide `FLUENTCI_CACHE_TOKEN` before starting. For S3, configure the bucket,
region, optional endpoint, write credentials and `cdn_url` pointing at the public
bucket root. The configured `prefix` is appended to that CDN URL; the CDN must
support GET, HEAD, and Range requests. Reads use the CDN anonymously, including
account caches, and do not fall back to authenticated S3 reads. Keep
`public_read = true` for public access through the cache server as well.
`/readyz` and `/metrics` require the administrator token. Readiness probes test
backend reachability, not S3 write permissions; verify a real PUT and GET too.

For local storage, use `backend = "file"` and
`directory = "/var/lib/fluentci-cache/objects"`. Systemd creates the writable
state directory; the rest of the filesystem is read-only. A different storage
location requires ownership for `fluentci-cache` and a `ReadWritePaths=` unit
override. The default listener is loopback port 8080; terminate HTTPS at a reverse
proxy and allow streaming PUT requests up to the configured size and timeout.
The production host's Caddy container uses host networking. Add the
[`caddy-cache.Caddyfile`](caddy-cache.Caddyfile) entry to
`/pds/caddy/etc/caddy/Caddyfile`, validate it with
`docker exec caddy caddy validate --config /etc/caddy/Caddyfile`, then reload with
`docker exec caddy caddy reload --config /etc/caddy/Caddyfile`. The service URL is
`https://cache.fluentci.io`; its separate public read origin is
`https://cache-cdn.fluentci.io`. Never configure the read origin to point back to
the cache service itself.

The service allows 330 seconds to drain transfers on shutdown. Increase
`TimeoutStopSec` when increasing the cache's 300-second transfer timeout.

For updates, stage the new binary as `/usr/local/bin/fluentci-cache.new`, rename
it over `/usr/local/bin/fluentci-cache`, then restart the service. This avoids
writing over a running executable. State is preserved across restarts.

### API-issued upload tokens

Generate an Ed25519 key pair on a trusted machine:

```sh
umask 077
openssl genpkey -algorithm ED25519 -out cache-upload-private.pem
openssl pkey -in cache-upload-private.pem -pubout -out cache-upload-public.pem
```

Install the private key only on the API host, readable by its service user. Set
`CACHE_TOKEN_PRIVATE_KEY_FILE` to its absolute path and `CACHE_PUBLIC_URL` to the
HTTPS cache server base URL (for example `https://cache.fluentci.io`) in the API
environment. Install the public key at `/etc/fluentci/cache-upload-public.pem`
on the cache host, readable by `fluentci-cache`, and enable the corresponding
setting in `cache.env`. `FLUENTCI_CACHE_UPLOAD_TOKEN_ISSUER` must match the API's
`SERVICE_DID`. Restart both services after key changes. Existing administrator
credentials remain separate from these user upload tokens.

See the [cache API documentation](../cache/README.md#account-upload-tokens)
for token issuance and invitations. No service is installed or started merely by
adding these files to the checkout.

### Usage history snapshots

The API records the latest UTC-day storage size and key count whenever an owner
refreshes their cache listing. Install the hourly snapshot job to keep history
updated between page visits:

```sh
sudo install -m 0644 systemd/fluentci-cache-usage.service /etc/systemd/system/
sudo install -m 0644 systemd/fluentci-cache-usage.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fluentci-cache-usage.timer
sudo systemctl start fluentci-cache-usage.service
sudo journalctl -u fluentci-cache-usage.service -n 20
```

This job uses the API's signing key and SQLite database, so install it on the API
host. Its Node path defaults to `/opt/fluentci-runtime/node`; override `ExecStart`
when using a different runtime path. Owners are registered when their storage is
first listed. The chart shows the last 14 UTC days; days without a recorded
snapshot remain missing. These are stored-object byte/count measurements, not
CDN request or cache-hit analytics.
