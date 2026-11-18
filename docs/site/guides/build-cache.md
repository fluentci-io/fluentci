---
title: "Remote build cache"
description: "Use account-scoped upload tokens with Bazel, sccache, Go, Gradle, Maven, Nix, and HTTP clients."
section: "Build pipelines"
url: "/guides/build-cache/"
source: "guides/build-cache.md"
---

## Get your cache URL and token

Open [Build cache](https://fluentci.io/cache), sign in, and generate an upload token.
The response contains your account cache URL and an upload token that remains valid until revoked.
The cache page generates tokens for the signed-in account. Invited collaborators
can request a shared-cache token through the createToken API with the owner's handle. See [cache access and CI credentials](/registry/cache/) for
invitations, revocation, and automated CI exchanges.

New tokens return a stable DID-based `cacheUrl`. The cache page also displays
a readable handle alias:

```text
https://cache.fluentci.io/did:plc:YOUR_DID
https://cache.fluentci.io/@your.handle
```

Use the DID URL for CI: changing or transferring a handle does not change the DID.
Handle aliases are verified against the DID document and cached for up to 60
seconds. Existing `/accounts/OWNER_HASH` URLs continue to work with the same
artifacts and tokens; no migration or token replacement is required.

Copy your stable URL from the cache page:

```sh
export FLUENTCI_CACHE_URL='https://cache.fluentci.io/did:plc:YOUR_DID'
export FLUENTCI_CACHE_TOKEN='PASTE_UPLOAD_TOKEN'
```

The API also returns `canonicalCacheUrl` with the existing hash namespace. Use
its `OWNER_HASH` for Bazel gRPC instance names, Turborepo team identifiers, and
OCI/BuildKit repository names. The cache page fills these protocol identifiers
automatically while using your DID URL for HTTP endpoints.

Use HTTPS. Keep upload tokens in your terminal or CI secret store and revoke them
when no longer needed. Do not distribute the cache server's administrator token.
CI credentials are exchanged for upload tokens and cannot be used directly as a
cache client password.

## Supported protocols

| Client                      | Append to your account URL                 | Upload authentication                |
| --------------------------- | ------------------------------------------ | ------------------------------------ |
| Bazel HTTP cache            | `/bazel`                                   | Bearer header                        |
| Bazel gRPC                  | instance `accounts/OWNER_HASH`             | Bearer metadata                      |
| Turborepo                   | `/turbo`                                   | `TURBO_TOKEN`                        |
| Nx                          | `/nx`                                      | Access-token environment variable    |
| BuildKit / Docker Buildx    | OCI registry `/v2/accounts/OWNER_HASH/...` | Docker login password                |
| sccache WebDAV              | `/sccache/`                                | Bearer token                         |
| Go helper                   | Nothing; helper adds `/gocache`            | `FLUENTCI_CACHE_TOKEN`               |
| Gradle HTTP build cache     | `/gradle/`                                 | Basic-auth password                  |
| Maven Build Cache Extension | `/maven/`                                  | Maven server password                |
| Nix binary cache            | `/nix`                                     | Bearer header on PUT                 |
| Generic HTTP                | `/generic/<key>`                           | Bearer header or Basic-auth password |

Reads are public when the server's public-read configuration and CDN are set up.
The production service is `https://cache.fluentci.io`; its read origin is
`https://cache-cdn.fluentci.io`. Use your returned cache service URL in clients;
it also generates Nix discovery metadata. Uploading never goes to the CDN.

This service stores build artifacts. It does not implement remote execution,
a Maven dependency proxy, a Go module proxy, or the Cachix API.
It is separate from the [native pipeline and package caches](/guides/caching/).

## Bazel

Use Bazel's HTTP remote cache with a bearer header.

### Build with remote caching

```sh
bazel build //... \
  --remote_cache="$FLUENTCI_CACHE_URL/bazel" \
  --remote_header="Authorization=Bearer $FLUENTCI_CACHE_TOKEN"
```

For read-only builds, omit the header and add --remote_upload_local_results=false. For gRPC, select Bazel gRPC. Remote execution is not supported.

[Bazel reference](https://bazel.build/remote/caching).

## Bazel gRPC

Use Bazel's gRPC cache services with an account-scoped instance.

### Build with gRPC caching

```sh
bazel build //... \
  --remote_cache='grpcs://cache.fluentci.io' \
  --remote_instance_name='accounts/OWNER_HASH' \
  --remote_header="Authorization=Bearer $FLUENTCI_CACHE_TOKEN"
```

Supports ActionCache, CAS, Capabilities, and resumable ByteStream with SHA-256. This is caching only; no remote executor is provided. Omit the header and disable uploads for public read-only use. The HTTPS proxy must forward gRPC over HTTP/2.

[Bazel gRPC reference](https://bazel.build/remote/caching).

## Turborepo

Share Turborepo artifacts through the HTTP remote cache.

### Configure the remote cache

```sh
export TURBO_API="$FLUENTCI_CACHE_URL/turbo"
export TURBO_TOKEN="$FLUENTCI_CACHE_TOKEN"
export TURBO_TEAM='OWNER_HASH'
bunx turbo run build --cache=remote:rw
```

TURBO_TEAM must match the cache owner's hash. Artifact signature headers are preserved; if your project enables signatures, configure the same TURBO_REMOTE_CACHE_SIGNATURE_KEY for every trusted client. Verified with Turborepo 2.11.10.

[Turborepo reference](https://turborepo.dev/docs/core-concepts/remote-caching).

## Nx

Use Nx's self-hosted HTTP remote cache.

### Configure Nx caching

```sh
export NX_SELF_HOSTED_REMOTE_CACHE_SERVER="$FLUENTCI_CACHE_URL/nx"
export NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN="$FLUENTCI_CACHE_TOKEN"
bunx nx run my-project:build
```

Replace my-project:build with a cacheable target in your workspace. Artifacts are immutable: an existing key returns 409. Verified with Nx 24.0.0; use a client version supporting the self-hosted remote-cache variables.

[Nx reference](https://nx.dev/docs/kb/self-hosted-caching).

## BuildKit / Docker Buildx

Export and restore BuildKit cache using the OCI registry interface.

### Authenticate and build

```sh
export FLUENTCI_CACHE_REGISTRY='cache.fluentci.io'
export FLUENTCI_CACHE_REF="$FLUENTCI_CACHE_REGISTRY/accounts/OWNER_HASH/buildkit/my-project:cache"
printf '%s' "$FLUENTCI_CACHE_TOKEN" | docker login "$FLUENTCI_CACHE_REGISTRY" --username ci --password-stdin
docker buildx build \
  --cache-from "type=registry,ref=$FLUENTCI_CACHE_REF" \
  --cache-to "type=registry,ref=$FLUENTCI_CACHE_REF,mode=max" .
```

Choose a Buildx driver with registry-cache support, such as docker-container. Replace my-project with a separate repository for each build. Supports cache manifests, indexes, blob upload resume, and public pulls; not a full registry management API. Verified with Buildx 0.36.1 and fresh BuildKit builders.

[BuildKit / Docker Buildx reference](https://docs.docker.com/build/cache/backends/registry/).

## sccache

Use a sccache build with WebDAV support enabled.

### Configure the WebDAV backend

```sh
export SCCACHE_WEBDAV_ENDPOINT="$FLUENTCI_CACHE_URL/sccache/"
export SCCACHE_WEBDAV_TOKEN="$FLUENTCI_CACHE_TOKEN"
export SCCACHE_WEBDAV_DISABLE_CREATE_DIR=true
export SCCACHE_WEBDAV_KEY_PREFIX='my-project/'
export RUSTC_WRAPPER=sccache
cargo build --release --locked
```

Directory creation must be disabled because this service does not implement PROPFIND or MKCOL. Restart an existing sccache daemon after changing its backend settings. For public reads only, omit the token and set SCCACHE_WEBDAV_RW_MODE=READ_ONLY.

[sccache reference](https://github.com/mozilla/sccache/blob/main/docs/Webdav.md).

## Go

Go 1.24+ uses the fluentci-cache helper through GOCACHEPROG. Install that standalone binary on PATH first.

### Enable the Go cache helper

```sh
export GOCACHEPROG='fluentci-cache gocache'
go build ./...
```

Keep FLUENTCI_CACHE_URL at the account base URL. The helper appends /gocache automatically; Go cannot use the HTTP URL directly.

[Go reference](https://go.dev/src/cmd/go/internal/cacheprog/cacheprog.go).

## Gradle

Configure Gradle's HTTP build cache using your token as a Basic-auth password.

### settings.gradle.kts

```kotlin
import org.gradle.caching.http.HttpBuildCache

buildCache {
    local { isEnabled = true }
    remote<HttpBuildCache> {
        url = uri(System.getenv("FLUENTCI_CACHE_URL") + "/gradle/")
        isPush = !System.getenv("FLUENTCI_CACHE_TOKEN").isNullOrBlank()
        credentials {
            username = "ci"
            password = System.getenv("FLUENTCI_CACHE_TOKEN") ?: ""
        }
    }
}
```

### Run the build

```sh
./gradlew --build-cache build
```

Alternatively set org.gradle.caching=true in gradle.properties. For public read-only use, omit the token; isPush will be false. The username can be any nonempty value.

[Gradle reference](https://docs.gradle.org/current/userguide/build_cache.html#sec:build_cache_configure_remote).

## Maven Build Cache

Use Maven 3.9+ and the Maven Build Cache Extension. The extension stores build results here; this is not a Maven dependency repository.

### .mvn/extensions.xml (if not already installed)

```xml
<extensions>
  <extension>
    <groupId>org.apache.maven.extensions</groupId>
    <artifactId>maven-build-cache-extension</artifactId>
    <version>1.3.0</version>
  </extension>
</extensions>
```

### .mvn/maven-build-cache-config.xml

```xml
<cache xmlns="http://maven.apache.org/BUILD-CACHE-CONFIG/1.4.0">
  <configuration>
    <enabled>true</enabled>
    <remote enabled="true" id="fluentci-cache" transport="resolver">
      <url>https://cache.fluentci.io/accounts/OWNER_HASH/maven/</url>
    </remote>
  </configuration>
</cache>
```

### ~/.m2/settings.xml

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

### Allow remote uploads

```sh
mvn verify -Dmaven.build.cache.remote.save.enabled=true
```

Merge these entries into existing XML files. Keep the server id identical in both files. Pin the extension version your project uses. For read-only builds, leave remote saving disabled and omit the credentials entry.

[Maven Build Cache reference](https://maven.apache.org/extensions/maven-build-cache-extension/remote-cache.html).

## Nix

Use the token to upload NAR files and signed narinfo. Nix consumers read publicly; Nix signing keys are separate from the FluentCI upload token.

### Consumer configuration in nix.conf

```text
extra-substituters = https://cache.fluentci.io/accounts/OWNER_HASH/nix
extra-trusted-public-keys = my-cache-1:YOUR_NIX_PUBLIC_KEY
```

### Generate Nix signing keys once on the publishing machine

```sh
nix-store --generate-binary-cache-key my-cache-1 nix-private.pem nix-public.pem
```

With public reads and an S3 backend, Nix metadata and binary reads receive a
307 redirect to the configured CDN. The redirect includes the storage prefix
and account namespace; Nix downloads directly from the CDN. Discovery
(`nix-cache-info`) stays on the service and uploads still require a token.
Private reads stay on the authenticated proxy path.

### Export a signed closure, then upload NAR files before metadata

```sh
# Set absolute paths to your signing key and store closure.
export NIX_SIGNING_KEY='/absolute/path/nix-private.pem'
export STORE_PATH='/nix/store/your-built-closure'
(
  set -eu
  export_dir="$(mktemp -d)"
  nix copy --to "file://$export_dir?secret-key=$NIX_SIGNING_KEY" "$STORE_PATH"
  cd "$export_dir"
  find nar -type f -print | while IFS= read -r file; do
    curl --fail-with-body \
      -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
      --upload-file "$file" "$FLUENTCI_CACHE_URL/nix/$file" || exit 1
  done
  find . -maxdepth 1 -name '*.narinfo' -print | while IFS= read -r file; do
    curl --fail-with-body \
      -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
      --upload-file "$file" "$FLUENTCI_CACHE_URL/nix/${file#./}" || exit 1
  done
)
```

Replace YOUR_NIX_PUBLIC_KEY with the contents of nix-public.pem after its my-cache-1: prefix. Keep nix-private.pem with the publisher. Do not upload nix-cache-info: the service generates it. Direct nix copy --to https://... uploads and the Cachix service API are not implemented.

[Nix reference](https://releases.nixos.org/nix/nix-2.34.7/manual/store/types/local-binary-cache-store.html).

## Generic HTTP

Store arbitrary files under /generic with a bearer token, or use the token as a Basic-auth password.

### Upload and read a file

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \
  --upload-file ./artifact.tar.zst \
  "$FLUENTCI_CACHE_URL/generic/my-project/artifact.tar.zst"

# Public read: no token needed.
curl --fail-with-body \
  "$FLUENTCI_CACHE_URL/generic/my-project/artifact.tar.zst" \
  --output artifact-copy.tar.zst
```

### Alternative Basic-auth upload

```sh
curl --fail-with-body --user "ci:$FLUENTCI_CACHE_TOKEN" \
  --upload-file ./artifact.tar.zst \
  "$FLUENTCI_CACHE_URL/generic/my-project/artifact.tar.zst"
```

Successful uploads return 201; missing objects return 404. Public reads also support HEAD and single byte ranges. Existing keys can be replaced.

[Generic HTTP reference](https://docs.fluentci.io/guides/build-cache/).

## Storage and collaborators

The cache page lists invited collaborators and lets owners remove access.
Owners can explore keys, filter by prefix, see total bytes and object count,
delete individual keys, or clear the cache after typing `CLEAR` to confirm.
Upload tokens and CI credentials cannot manage storage. Public CDN copies may
remain available until their cached responses expire after origin deletion.
See [storage management](/registry/cache/#explore-storage-and-manage-collaborators).

## Run your own cache

The standalone `fluentci-cache` server supports S3-compatible, file, and memory
storage. See [deploy the cache server](/development/build-cache/) for systemd,
R2/S3 settings, CDN configuration, and signing-key setup.
