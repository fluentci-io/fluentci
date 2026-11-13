# fluentci-cache

A standalone Rust build-cache server built on Tokio, Axum, and `object_store`. One service handles multiple build tools, with isolated storage namespaces and an S3-compatible backend by default.

Writes require a token. Reads are public by default and can be made private at the server. S3 deployments require a public CDN base URL for object reads. Configuration comes from TOML, environment variables, or CLI flags.

## Quick start

From the repository root:

```sh
cargo build --release --locked --manifest-path cache/Cargo.toml
export FLUENTCI_CACHE_TOKEN="$(openssl rand -hex 32)"
./cache/target/release/fluentci-cache serve --backend file --directory ./cache-data
```

The server listens on `127.0.0.1:8080`. In another terminal, using the same token:

```sh
printf 'hello cache\n' > /tmp/artifact
curl --fail-with-body \
  -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
  --upload-file /tmp/artifact http://127.0.0.1:8080/generic/demo
curl --fail-with-body http://127.0.0.1:8080/generic/demo
curl --head http://127.0.0.1:8080/generic/demo
```

No FluentCI CLI, Studio build, database, or external service is needed for the file backend. The crate has its own manifest and lockfile; build it using `--manifest-path cache/Cargo.toml`, or run Cargo from `cache/`.

## Protocol support

| Client | Base URL / endpoints | Supported interface |
| --- | --- | --- |
| Nix | `/` or `/nix/` | `nix-cache-info`, `.narinfo`, and compressed NAR downloads; token-authenticated PUT publishing |
| sccache | `/sccache/` | HTTP GET/PUT using its WebDAV backend with directory creation disabled |
| Go | `/gocache/` | Included `fluentci-cache gocache` helper implements `GOCACHEPROG` |
| Maven Build Cache Extension | `/maven/` | Hierarchical HTTP GET/PUT using Maven Resolver transport |
| Gradle | `/gradle/` | HTTP build cache GET/PUT |
| Bazel | `/` or `/bazel/` | HTTP remote cache `/ac/<sha256>` and `/cas/<sha256>` |
| Generic | `/generic/` | Arbitrary hierarchical keys over GET/HEAD/PUT |

Nix's binary-cache download format is supported; the Cachix service API, Cachix CLI upload protocol, server-side NAR generation, and signing are not implemented. Publish signed `.narinfo` and NAR files produced by Nix. This is a cache server, not a remote executor, Maven Central proxy, Go module proxy, or Bazel gRPC/REAPI server.

### HTTP behavior

- `GET` returns `200` with the stored bytes, or `404` for a miss.
- `HEAD` returns object metadata without the body.
- `PUT` atomically publishes an object and returns `201`; existing keys can be replaced.
- Every PUT requires the configured token, including requests from localhost.
- `Authorization: Bearer <token>` and Basic authentication with `<token>` as the password are accepted. The Basic username is ignored.
- Single byte ranges return `206`; invalid or unsatisfiable ranges return `416`.
- `ETag`, `If-Match`, and `If-None-Match` support revalidation of reads. Conditional writes, multipart HTTP range responses, `If-Range`, and date-based conditions are not implemented.
- Bazel CAS keys must be lowercase SHA-256 hex digests. PUT hashes the bytes before publication and rejects mismatches with `400`. Action-cache values remain opaque.
- Namespaces are isolated: `/gradle/key` and `/generic/key` are different objects. Root `/ac` and `/cas` alias their `/bazel` equivalents; root Nix paths alias `/nix`.
- Keys are case-sensitive, at most 2,048 decoded bytes, and may have nested segments. Empty segments, dot segments, control characters, backslashes, and literal percent characters are rejected. Query parameters do not affect keys. Clients should use URL-safe keys.
- `DELETE`, `POST`, `PROPFIND`, and `MKCOL` return `405`. Object deletion and listings are intentionally not exposed through HTTP.

## Configuration

Copy [cache.example.toml](cache.example.toml) and choose a backend:

```sh
export FLUENTCI_CACHE_TOKEN="$(openssl rand -hex 32)"
./cache/target/release/fluentci-cache serve --config cache/cache.example.toml
```

Precedence, from lowest to highest:

1. Built-in CLI defaults.
2. The explicitly selected TOML file.
3. Environment variables.
4. Explicit command-line arguments.

No file is loaded implicitly. Use `--config` or `FLUENTCI_CACHE_CONFIG`. Unknown TOML keys and invalid values fail startup. Paths are relative to the process working directory. TOML fields are flat, use snake_case, and may be omitted to use defaults. Files are read once at startup; restart to apply changes. `.env` files are not automatically loaded.

```toml
backend = "s3"
bind = "0.0.0.0:8080"
bucket = "build-cache"
endpoint = "https://s3.example.com"
cdn_url = "https://cdn.example.com"
region = "us-east-1"
prefix = "fluentci-cache/v1"
public_read = true
read_only = false
max_upload = 10737418240
concurrency = 128
timeout = 300
nix_priority = 40
```

Keep the token in the environment, a service secret, or a permission-restricted TOML file. A writable server refuses to start without a nonempty token. To run a public read-only cache without a token, set `read_only = true`.

| TOML field | Environment variable | CLI flag | Default |
| --- | --- | --- | --- |
| — | `FLUENTCI_CACHE_CONFIG` | `--config` | no file |
| `backend` | `FLUENTCI_CACHE_BACKEND` | `--backend` | `s3` (`s3`, `file`, `memory`) |
| `bind` | `FLUENTCI_CACHE_BIND` | `--bind` | `127.0.0.1:8080` |
| `bucket` | `FLUENTCI_CACHE_BUCKET` | `--bucket` | required for S3 |
| `endpoint` | `FLUENTCI_CACHE_ENDPOINT` | `--endpoint` | AWS endpoint |
| `cdn_url` | `FLUENTCI_CACHE_CDN_URL` | `--cdn-url` | required for S3; public bucket-root URL |
| `region` | `FLUENTCI_CACHE_REGION` | `--region` | `us-east-1` |
| `allow_http` | `FLUENTCI_CACHE_ALLOW_HTTP` | `--allow-http [true/false]` | `false` |
| `prefix` | `FLUENTCI_CACHE_PREFIX` | `--prefix` | `fluentci-cache/v1` |
| `directory` | `FLUENTCI_CACHE_DIRECTORY` | `--directory` | `./cache-data` |
| `token` | `FLUENTCI_CACHE_TOKEN` | `--token` | required for writes |
| `public_read` | `FLUENTCI_CACHE_PUBLIC_READ` | `--public-read true/false` | `true` |
| `read_only` | `FLUENTCI_CACHE_READ_ONLY` | `--read-only [true/false]` | `false` |
| `max_upload` | `FLUENTCI_CACHE_MAX_UPLOAD` | `--max-upload` | 10 GiB, in bytes |
| `concurrency` | `FLUENTCI_CACHE_CONCURRENCY` | `--concurrency` | 128 active object transfers |
| `timeout` | `FLUENTCI_CACHE_TIMEOUT` | `--timeout` | 300 seconds |
| `nix_priority` | `FLUENTCI_CACHE_NIX_PRIORITY` | `--nix-priority` | 40 |

Boolean environment values are `true` or `false`. Use explicit `--read-only false` or `--allow-http false` to override a true TOML value. Flags shown without a value also enable those two settings. Set `--public-read false` to require the same token for object reads. Metrics and readiness require authentication whenever a token is configured.

### S3 and compatible services

The bucket must already exist. Configure a public CDN URL that serves the bucket contents. Writes use path-style S3 requests and the `object_store` AWS credential provider; object GET/HEAD requests stream through the CDN with connection pooling and retries. For static credentials:

```sh
export AWS_ACCESS_KEY_ID='...'
export AWS_SECRET_ACCESS_KEY='...'
# export AWS_SESSION_TOKEN='...'  # temporary credentials
export FLUENTCI_CACHE_TOKEN='...'
export FLUENTCI_CACHE_BUCKET='build-cache'
export FLUENTCI_CACHE_CDN_URL='https://cdn.example.com'
export FLUENTCI_CACHE_REGION='us-east-1'
# Set for MinIO, R2, or another compatible service:
export FLUENTCI_CACHE_ENDPOINT='https://s3.example.com'
./cache/target/release/fluentci-cache serve
```

Use the `FLUENTCI_CACHE_*` variables above for bucket, endpoint, CDN URL, and region. AWS credential variables control storage access; `FLUENTCI_CACHE_TOKEN` controls HTTP clients. They are independent. Ambient AWS web-identity and workload credential support is provided by the underlying [AWS builder](https://docs.rs/object_store/0.12.5/object_store/aws/struct.AmazonS3Builder.html).

`cdn_url` is required whenever `backend = "s3"`, including read-only S3 deployments. Configure it through TOML, `FLUENTCI_CACHE_CDN_URL`, or `--cdn-url`. It must be an absolute HTTP(S) URL without credentials, query parameters, or a fragment. Use HTTPS in production. File and memory backends do not require or use it.

The CDN base URL maps to the **bucket root**, before the configured storage prefix. For example:

```text
cdn_url:     https://cdn.example.com/assets
prefix:      fluentci-cache/v1
client GET:  /bazel/cas/<digest>
CDN GET:     https://cdn.example.com/assets/fluentci-cache/v1/bazel/cas/<digest>
S3 key:      fluentci-cache/v1/bazel/cas/<digest>
```

Leading bucket/origin paths belong in `cdn_url`; do not repeat `prefix` there. A trailing slash is optional. CDN requests are anonymous: neither the client's cache token nor AWS credentials are forwarded. The server proxies the bytes rather than redirecting build clients, so existing protocol URLs remain unchanged. Nix discovery is still generated locally. There is no S3 fallback if the CDN returns a miss or fails.

The CDN must return 404 for missing objects and support GET, HEAD, `Content-Length`, and single byte ranges; preserve ETags when possible and serve the exact uploaded bytes without transformations. Configure its origin access separately so it can read the bucket. Disable negative caching and configure revalidation or invalidation for mutable action entries, Gradle keys, and narinfo: successful S3 writes do not invalidate CDN entries. `public_read = false` authenticates requests to this server, but the required public CDN still exposes the artifacts directly.

For a local HTTP MinIO deployment, set `FLUENTCI_CACHE_ENDPOINT=http://127.0.0.1:9000` and `FLUENTCI_CACHE_ALLOW_HTTP=true`. `allow_http` applies to the S3 write endpoint; the CDN URL explicitly chooses HTTP or HTTPS. Set a public bucket-root CDN URL for MinIO as well. Inbound TLS is handled by your reverse proxy.

Grant the storage identity access only to this bucket/prefix: object reads, writes, and multipart upload/abort operations. A read-only deployment needs only read access. On AWS S3, a HEAD for an absent readiness probe object requires `s3:ListBucket` to return 404 rather than 403; grant that permission for readiness, or provision an object at `<prefix>/.readiness`. Do not share this prefix with clients writing directly to S3 using their own native cache layouts: the server owns its namespace layout.

### File and memory backends

```sh
# Durable local object storage, atomically published by object_store.
fluentci-cache serve --backend file --directory /var/lib/fluentci-cache

# Ephemeral development storage; all data is lost on restart.
fluentci-cache serve --backend memory
```

Both commands need `FLUENTCI_CACHE_TOKEN` unless read-only. The memory backend retains entire objects in RAM; use file or S3 for large caches. No server-side object eviction, TTL, or size quota is implemented. Use bucket lifecycle rules for S3 retention and external housekeeping for files. Coordinate eviction so NARs and Bazel CAS objects are not removed while referenced metadata remains useful.

## Client setup

Examples use `https://cache.example.com`. Use `http://127.0.0.1:8080` for local testing. Insecure HTTP may need an explicit opt-in in individual clients.

### Bazel

`.bazelrc`:

```text
build --remote_cache=https://cache.example.com/bazel
```

On a trusted writer, supply the token through your CI secret mechanism:

```sh
bazel build //... \
  --remote_header="Authorization=Bearer $FLUENTCI_CACHE_TOKEN"
```

For consumers that must not upload, use `--remote_upload_local_results=false`. Select an HTTP URL, not a `grpc://` URL. This server validates `/cas/` content hashes; `/ac/` values are stored unchanged. See [Bazel HTTP caching](https://bazel.build/remote/caching).

### sccache

```sh
export SCCACHE_WEBDAV_ENDPOINT='https://cache.example.com/sccache/'
export SCCACHE_WEBDAV_TOKEN="$FLUENTCI_CACHE_TOKEN"
export SCCACHE_WEBDAV_DISABLE_CREATE_DIR=true
export SCCACHE_WEBDAV_KEY_PREFIX='my-project/'
export RUSTC_WRAPPER=sccache
cargo build --release --locked
```

Use a sccache build with its WebDAV backend enabled. Disable PROPFIND/MKCOL directory creation: object storage has no real directories. Public read-only consumers can omit the token and set `SCCACHE_WEBDAV_RW_MODE=READ_ONLY`. If changing backend settings on an already-running sccache daemon, restart it before testing. See [sccache configuration](https://github.com/mozilla/sccache/blob/main/docs/Configuration.md).

### Go

Install or copy the release binary to an absolute path available to Go:

```sh
export FLUENTCI_CACHE_URL='https://cache.example.com'
export FLUENTCI_CACHE_TOKEN='...'
export GOCACHEPROG='/absolute/path/fluentci-cache gocache'
go build ./...
```

Go 1.24+ supports `GOCACHEPROG`. Go does not use an HTTP cache URL directly; the helper speaks its JSON stdin/stdout protocol and bridges it to this service.

The helper advertises `get`, `put`, and `close`, handles up to 32 HTTP requests concurrently, streams base64 bodies through local files, verifies output SHA-256 hashes, and retains returned files until Go closes the session. Logs go to stderr; stdout is reserved for protocol responses. Each remote entry atomically contains its 32-byte output ID followed by its payload.

| Helper setting | Flag | Default |
| --- | --- | --- |
| `FLUENTCI_CACHE_URL` | `--url` | `http://127.0.0.1:8080` |
| `FLUENTCI_CACHE_TOKEN` | `--token` | none; required for remote writes |
| `FLUENTCI_CACHE_GO_DIRECTORY` | `--directory` | OS temporary directory |
| — | `--max-object` | 10 GiB of payload |

The helper has a 300-second HTTP request timeout. Server `max_upload` must accommodate payload **plus 32 bytes**. Temporary files are session-scoped; this helper does not maintain a persistent local read-through cache. A crashed helper may leave its temporary session directory behind. Remote failures are reported through the Go protocol, rather than silently presented as hits. See [Go's cache protocol](https://go.dev/src/cmd/go/internal/cacheprog/cacheprog.go).

### Gradle

In `settings.gradle.kts`:

```kotlin
import org.gradle.caching.http.HttpBuildCache

buildCache {
    local { isEnabled = true }
    remote<HttpBuildCache> {
        url = uri("https://cache.example.com/gradle/")
        isPush = System.getenv("FLUENTCI_CACHE_TOKEN") != null
        credentials {
            username = "ci"
            password = System.getenv("FLUENTCI_CACHE_TOKEN") ?: ""
        }
    }
}
```

Enable caching in `gradle.properties`:

```properties
org.gradle.caching=true
```

For local HTTP testing, set `isAllowInsecureProtocol = true`. The Basic-auth password is the write token. See [Gradle's HTTP cache](https://docs.gradle.org/current/userguide/build_cache.html#sec:build_cache_configure_remote).

### Maven Build Cache Extension

With Maven 3.9.0+, install the extension in `.mvn/extensions.xml`, pinning the version used by your project:

```xml
<extensions>
  <extension>
    <groupId>org.apache.maven.extensions</groupId>
    <artifactId>maven-build-cache-extension</artifactId>
    <version>1.3.0</version>
  </extension>
</extensions>
```

In `.mvn/maven-build-cache-config.xml`:

```xml
<cache xmlns="http://maven.apache.org/BUILD-CACHE-CONFIG/1.4.0">
  <configuration>
    <enabled>true</enabled>
    <remote enabled="true" id="fluentci-cache" transport="resolver">
      <url>https://cache.example.com/maven/</url>
    </remote>
  </configuration>
</cache>
```

In `~/.m2/settings.xml`, or the CI-managed settings file:

```xml
<settings>
  <servers>
    <server>
      <id>fluentci-cache</id>
      <username>ci</username>
      <password>${env.FLUENTCI_CACHE_TOKEN}</password>
    </server>
  </servers>
</settings>
```

Enable remote saving only on trusted writers:

```sh
mvn verify -Dmaven.build.cache.remote.save.enabled=true
```

Maven Resolver controls the extension's hierarchical object layout and transport. This endpoint stores build-cache artifacts; it does not fetch or proxy dependency repositories. See the [extension parameters](https://maven.apache.org/extensions/maven-build-cache-extension/parameters.html).

### Nix

Configure consumers:

```text
extra-substituters = https://cache.example.com/nix
extra-trusted-public-keys = cache.example.com-1:YOUR_PUBLIC_KEY
```

Generate a signing key once and keep its private part with the publisher:

```sh
nix-store --generate-binary-cache-key cache.example.com-1 cache-private.pem cache-public.pem
```

Export a closure into a local binary-cache directory, then publish NARs before their `.narinfo` metadata. With absolute paths in `NIX_SIGNING_KEY` and `STORE_PATH`:

```sh
export_dir="$(mktemp -d)"
nix copy --to "file://$export_dir?secret-key=$NIX_SIGNING_KEY" "$STORE_PATH"

# Exit immediately if either publication stage fails.
set -eu
# Upload NAR payloads first. Run these commands from the export directory.
cd "$export_dir"
find nar -type f -print | while IFS= read -r file; do
  curl --fail-with-body \
    -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
    --upload-file "$file" "https://cache.example.com/nix/$file" || exit 1
done
find . -maxdepth 1 -name '*.narinfo' -print | while IFS= read -r file; do
  curl --fail-with-body \
    -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
    --upload-file "$file" "https://cache.example.com/nix/${file#./}" || exit 1
done
```

Stop publishing if the NAR upload step fails; do not publish metadata pointing to missing NARs. Do not upload the exported `nix-cache-info`: the server generates it. It advertises `/nix/store`, the configured priority, and `WantMassQuery: 0`. NAR compression and signature fields are preserved as uploaded; consumers validate signatures and NAR integrity. The server treats NARs and narinfo as opaque objects and does not verify those signatures itself.

Read about [Nix binary caches](https://releases.nixos.org/nix/nix-2.35.1/manual/protocols/binary-cache/index.html) and the [local binary cache store](https://releases.nixos.org/nix/nix-2.34.7/manual/store/types/local-binary-cache-store.html).

### Generic cache

Choose your own stable keys and payload format:

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
  --upload-file artifact.tar.zst \
  https://cache.example.com/generic/project/platform/build-key
curl --fail-with-body \
  -o artifact.tar.zst \
  https://cache.example.com/generic/project/platform/build-key
```

The server does not automatically compress, deserialize, or execute uploaded data.

## Architecture and performance

```text
Build tools ── HTTP ── Axum routes ── namespace + auth + limits
Go ── GOCACHEPROG helper ──┘              ├─ writes ── ObjectStore (S3 / file / memory)
                                        └─ reads ─── Public CDN (S3) / same store (file / memory)
```

- Downloads stream from the public CDN for S3, or directly from the configured store for file/memory backends, with backpressure. Ordinary GETs take one backend operation; ranged GETs also perform a HEAD for range validation.
- Small PUTs use a single object write. At 8 MiB, uploads switch to multipart storage, with two parts in flight and one accumulating buffer. Memory use scales with active transfers, not total artifact size, except for the intentionally in-memory backend.
- Multipart objects become visible only after the entire request and CAS validation succeed. Disconnects, errors, and upload deadline cancellation trigger best-effort abort of unfinished multipart uploads. Configure S3 lifecycle cleanup for orphaned uploads after crashes.
- Active object transfers are capped by `concurrency`; download permits remain held until the body is consumed or dropped. Saturation returns `503` immediately rather than building an unbounded request queue.
- Uploads have an overall deadline. Backend response acquisition has the same deadline; download streams have a per-chunk idle timeout.
- Metadata and action entries may change. Successful reads use `private, max-age=0, must-revalidate`; misses use `no-store`. There is no process-local object cache. CDN caching and invalidation must be configured separately for mutable keys.
- S3 replicas can share a bucket/prefix. Separate deployments with distinct prefixes. One token grants writes to every protocol namespace; per-project tokens, quotas, and tenant isolation are not implemented.

These are implementation properties, not benchmark throughput claims. Measure your actual artifact distribution, backend latency, concurrency, and network before tuning. Each active multipart upload can retain roughly 24 MiB of payload buffers, plus HTTP/storage overhead. Lower the default concurrency on small machines.

## Operations

- `GET /healthz`: public liveness probe; does not access storage.
- `GET /readyz`: authenticated when a token is configured; probes the write store and, for S3, the CDN with HEAD requests and accepts missing probe objects as healthy. This checks read connectivity, not write permissions.
- `GET /metrics`: authenticated when a token is configured; Prometheus text counters for object requests, hits, misses, successful writes, bytes written, and rejections. Probe requests are excluded; hits count accepted reads, including HEAD, before body completion.
- `RUST_LOG=info` sets logging verbosity. Logs go to stderr. The application does not log authorization headers or configuration tokens.
- SIGINT/SIGTERM stop accepting requests and drain in-flight connections.

Example probe:

```sh
curl --fail-with-body -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
  http://127.0.0.1:8080/readyz
curl --fail-with-body -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
  http://127.0.0.1:8080/metrics
```

For network deployments, terminate TLS at a reverse proxy and forward the Authorization header. Configure its upload limit and timeouts to accommodate artifacts, disable request buffering if streaming is desired, and ensure PUT is enabled. The server's HTTP listener does not implement TLS itself. Tokens authorize writes but do not encrypt traffic. Public reads expose all objects whose keys are known; set `public_read = false` for private artifacts.

S3 bucket lifecycle policies provide retention. The file backend needs enough disk space and external retention management. The Go helper also needs temporary disk space for its session outputs. No background compaction or administrative deletion API runs inside the server.

## Development and tests

Rust 1.90+ is required. Always use release mode for builds and validation:

```sh
cd cache
./scripts/check.sh
# Equivalent individual checks:
cargo fmt --all --check
cargo build --release --locked
cargo test --release --locked
cargo clippy --release --locked --all-targets -- -D warnings
```

The suite covers protocol routes, misses, namespace isolation, Nix discovery, token and Basic authentication, private reads, read-only mode, malformed keys, size limits, CAS validation, ranged/conditional reads, multipart atomicity, interrupted uploads, deadlines, transfer concurrency, file persistence, configuration precedence, and Go's JSON/body/file-lifetime protocol. Go helper and CDN integration tests bind localhost sockets. CDN tests verify GET/HEAD, range and conditional reads, prefix mapping, token isolation, write separation, misses, and readiness.

Optional test with an installed Go 1.24+ compiler:

```sh
cargo test --release --locked --test gocache \
  real_go_client_reuses_remote_cache_across_empty_local_caches -- --ignored --nocapture
```

This compiles a tiny module twice with separate empty `GOCACHE` directories and verifies that the server records remote hits. It needs no downloaded Go modules.

Optional S3 integration test against an existing disposable bucket (for example, local MinIO):

```sh
export AWS_ACCESS_KEY_ID='...'
export AWS_SECRET_ACCESS_KEY='...'
export FLUENTCI_CACHE_TEST_BUCKET='cache-test'
export FLUENTCI_CACHE_TEST_ENDPOINT='http://127.0.0.1:9000'
export FLUENTCI_CACHE_TEST_CDN_URL='https://cdn.example.com'  # public bucket root
cargo test --release --locked --test http s3_backend_round_trip -- --ignored --nocapture
```

For a reproducible local S3 API emulator instead of an existing bucket:

```sh
docker run --detach --rm --name fluentci-cache-moto \
  -p 127.0.0.1:5000:5000 ghcr.io/getmoto/motoserver:5.1.16
# Wait for the service, then create a disposable bucket.
curl --fail-with-body --retry 10 --retry-connrefused --retry-delay 1 \
  -X PUT http://127.0.0.1:5000/cache-test
export AWS_ACCESS_KEY_ID=local-test
export AWS_SECRET_ACCESS_KEY=local-test
export FLUENTCI_CACHE_TEST_BUCKET=cache-test
export FLUENTCI_CACHE_TEST_ENDPOINT=http://127.0.0.1:5000
# Moto is an emulator: the bucket endpoint can stand in for the public CDN.
export FLUENTCI_CACHE_TEST_CDN_URL=http://127.0.0.1:5000/cache-test
# Allow anonymous GETs for the CDN-facing URL.
curl --fail-with-body -X PUT 'http://127.0.0.1:5000/cache-test?policy' \
  -H 'Content-Type: application/json' \
  --data '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::cache-test/*"}]}'
cargo test --release --locked --test http s3_backend_round_trip -- --ignored --nocapture
docker stop fluentci-cache-moto
```

An emulator checks S3 API integration; also validate credentials and behavior with your chosen storage vendor before deployment.

The test uses a unique prefix, uploads small and multipart objects, checks HEAD and ranged reads, and deletes those objects after success. Interrupted tests may leave objects under `fluentci-cache-tests/`. Without an endpoint it uses AWS S3. The Go and S3 external integration tests are ignored by the default suite. HTTP contract tests do not replace end-to-end testing with every supported client version.

### Add a storage backend

Embed `router(config, Arc<dyn ObjectStore>)` from `fluentci_cache` and pass any implementation of `object_store::ObjectStore`. The HTTP layer is independent of S3. Apply any required storage prefix when constructing the store; `Config::storage()` applies the configured prefix for built-in backends, while `router()` uses the supplied store unchanged for writes. For S3 configurations it constructs a separate anonymous HTTP reader from `cdn_url` and applies `prefix`; for other backends the supplied store also handles reads. Backends must support atomic publication, multipart uploads, HEAD, GET with ranges, and PUT.

Built-in backend selection is in [src/config.rs](src/config.rs); HTTP modules are in [src/server/](src/server/), and the Go helper is in [src/gocache/](src/gocache/).

```text
src/
├── config.rs             # TOML/env/CLI configuration and built-in backend factory
├── lib.rs                # public library API
├── main.rs               # CLI entry point and graceful shutdown
├── server/
│   ├── mod.rs            # shared state and router construction
│   ├── auth.rs           # token and Basic authentication
│   ├── download.rs       # streaming reads, ranges, and conditionals
│   ├── error.rs          # HTTP errors and backend error mapping
│   ├── key.rs            # namespace resolution and key validation
│   ├── ops.rs            # readiness and Prometheus metrics
│   ├── routes.rs         # request dispatch and Nix discovery
│   └── upload.rs         # streaming writes, multipart cleanup, and CAS validation
└── gocache/
    ├── mod.rs            # helper configuration and concurrent session lifecycle
    ├── protocol.rs       # Go requests, base64 input, and ID validation
    └── remote.rs         # remote HTTP storage and output materialization
```

 To expose another backend through the CLI, add its enum variant and factory branch, configuration fields, and round-trip tests.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| Server refuses to start without a token | Set `FLUENTCI_CACHE_TOKEN`, or explicitly choose a read-only server. |
| `401` on writes | Match the server token; use Bearer auth or Basic password. Verify proxy header forwarding. |
| `403` on PUT | The server is configured read-only, or the target is managed `nix-cache-info`. |
| `404` despite an upload | Check namespace, object key case, bucket, prefix, CDN origin mapping, and negative caching. |
| `400` on Bazel CAS | The key must equal the SHA-256 of the actual uploaded bytes. |
| `413` | Raise `max_upload` and the reverse proxy's upload limit if appropriate. |
| `503` | Active transfers reached the configured limit; reduce client parallelism or tune the server. |
| `502` | Inspect backend error logs, CDN access and headers, credentials, endpoint, region, bucket permissions, and storage health. |
| sccache sends `PROPFIND` / `MKCOL` | Set `SCCACHE_WEBDAV_DISABLE_CREATE_DIR=true` and restart its daemon. |
| Go fails to start its helper | Use an absolute binary path, verify Go version and temporary-disk access. |
| Nix cannot trust a cached path | Publish signed narinfo, configure the matching trusted public key, and verify all referenced NARs were uploaded first. |
