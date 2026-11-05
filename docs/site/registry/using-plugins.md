---
title: "Find and run plugins"
description: "Search the registry, qualify a publisher, and execute verified Wasm downloads."
section: "Studio and publishing"
url: "/registry/using-plugins/"
source: "registry/using-plugins.md"
---

## Search

```sh
fluentci search rust
fluentci search 'rust compiler' --limit 20
```

The registry indexes plugin names and descriptions with SQLite FTS5. Words use
prefix matching and are combined with AND. Publisher filtering and pagination
are available through the [XRPC API](/reference/registry-api/). Search input is
literal text, not raw FTS operators.

## Qualify package identity

Package identity is publisher plus plugin name. Use a handle or DID to avoid
ambiguity:

```sh
fluentci run --wasm alice.example/hello-ci@1.0.0 hello
```

A declared local module wins over a registry package with the same selector.
Without an explicit version, package resolution chooses the latest stable
SemVer release, using a prerelease only when no stable release exists. Explicit
versions make reproducible automation easier.

## Download and execution

Registry metadata provides the public Wasm URL, expected size, and checksum.
The CLI validates the downloaded Wasm and SHA-256 before caching or running it.
Set `FLUENTCI_PACKAGE_CACHE` to change the package cache directory.

A Wasm plugin can request host operations through the engine. Review the plugin
and its publisher before running it with access to a sensitive workspace or
credentials. Wasm packages pipeline logic, not every tool the job needs.

## Use a URL module

When a project already knows its artifact URL, declare it directly:

```toml
[[modules]]
name = "shared"
url = "https://plugins.example/shared.wasm"
```

Then run `fluentci run shared hello`. A direct URL module and a registry package
are different inputs: registry metadata carries publisher/version/checksum
information, while a URL declaration identifies a compiled artifact directly.
