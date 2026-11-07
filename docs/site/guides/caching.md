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

| Variable                      | Purpose                      |
| ----------------------------- | ---------------------------- |
| `FLUENTCI_CACHE_GCS_BUCKET`   | GCS cache bucket             |
| `FLUENTCI_CACHE_S3_ENDPOINT`  | S3-compatible cache endpoint |
| `FLUENTCI_CACHE_S3_BUCKET`    | S3-compatible cache bucket   |
| `FLUENTCI_CACHE_CDN_ENDPOINT` | Optional cache download CDN  |

GCS uses `GOOGLE_APPLICATION_CREDENTIALS`. S3-compatible caches use AWS credential
configuration. These cache variables are separate from the registry API's
`S3_BUCKET` and `S3_PUBLIC_URL`, which store published Wasm artifacts.

## Diagnose cache surprises

Identify the store before invalidating anything: package download cache, language
compiler cache, native-task cache, or project history. Compare input paths and
toolchain versions between hosts. Use [logs and tracing](/guides/observability/)
to distinguish a cached task from a fresh command failure.
