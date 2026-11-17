---
title: "Caching"
description: "Understand which state belongs to the CLI, the plugin toolchain, and the execution engine."
section: "Build pipelines"
url: "/guides/caching/"
source: "guides/caching.md"
---

## Separate the stores

The application SQLite database holds projects, actions, runs, jobs, and logs.
Deleting it does not clear compiler caches or every engine cache. Plugin source
builds can also use Cargo, npm, Spago, or Maven caches owned by their toolchains.

Verified registry Wasm downloads use a package cache. Override its location with
`FLUENTCI_PACKAGE_CACHE`. Downloaded registry artifacts are checked against their
metadata checksum before invocation.

## Pipeline and native-task caches

SDKs expose cache builders for host execution. Use a key/output contract that
matches the actual inputs, tools, and environment. Native task caches can include
inputs, outputs, toolchain files, and relocatable cache behavior; see the matching
engine SDK's host-plan API.

A successful cache lookup does not install missing host tools or make absolute
paths portable. Do not put credentials into a key or into cached output files.

## Remote cache configuration

The native DAG action cache currently uses local action records and a local
content-addressed blob store. The following remote variables belong to the legacy
pipeline cache; they do not enable remote transport for native action records.

| Variable                       | Purpose                               |
| ------------------------------ | ------------------------------------- |
| `FLUENTCI_CACHE_GCS_BUCKET`    | GCS cache bucket                      |
| `FLUENTCI_CACHE_S3_ENDPOINT`   | S3-compatible cache endpoint          |
| `FLUENTCI_CACHE_S3_BUCKET`     | S3-compatible cache bucket            |
| `FLUENTCI_CACHE_CDN_ENDPOINT`  | Optional cache download CDN           |
| `FLUENTCI_CACHE_DOWNLOAD_JOBS` | Parallel CDN workers, 1–32; default 4 |

GCS uses `GOOGLE_APPLICATION_CREDENTIALS`. S3-compatible caches use AWS credential
configuration. These cache variables are separate from the registry API's
`S3_BUCKET` and `S3_PUBLIC_URL`, which store published Wasm artifacts.

CDN archive restores use a Tokio/reqwest downloader with an indicatif progress
bar showing percentage, transferred bytes, speed, and ETA. Four workers download
8 MiB byte ranges in parallel when the server provides range support and a strong
ETag. Set `FLUENTCI_CACHE_DOWNLOAD_JOBS` to tune concurrency. Origins without a
strong validator or range support use a single streaming request; unknown-length
responses show a byte counter. Progress renders on stderr in a terminal.

Downloads publish atomically after verifying byte ranges and lengths. A missing
object is a cache miss; interrupted, changed, or malformed responses cannot leave
a partial archive in the cache. This archive transport does not add remote
transport to the native DAG action-record store.

## Diagnose cache surprises

Identify the store before invalidating anything: package download cache, language
compiler cache, native-task cache, or project history. Compare input paths and
toolchain versions between hosts. Use [logs and tracing](/guides/observability/)
to distinguish a cached task from a fresh command failure.

## Shared build-tool cache

For account-scoped remote caching with Bazel HTTP/gRPC, Turborepo, Nx, BuildKit,
sccache, Go, Gradle, Maven, Nix, and generic HTTP clients, see
[remote build cache](/guides/build-cache/).
