---
title: "fluentci.lock"
description: "Pin registry versions, Wasm checksums, and Git commits for reproducible module execution."
section: "Reference"
url: "/reference/lockfile/"
source: "reference/lockfile.md"
---

## Install dependencies

```sh
fluentci install
```

The CLI resolves registry modules declared in `fluentci.toml`, downloads verified
Wasm artifacts, checks out Git module sources, and writes `fluentci.lock` in the
workspace root. Local source modules still use their SDK's own dependency tools.
Dependencies declared by `fluentci-module.toml` are included too. Direct Wasm
URL dependencies are pinned by checksum and reused from the verified cache.

Registry dependencies pin the resolved version, publisher DID, Wasm URL and
SHA-256, registry origin, and available record URI/CID and source metadata.
Git dependencies pin an exact commit for the requested branch, tag, or revision.
The file also records module aliases and their source references.

Commit `fluentci.lock` with `fluentci.toml` or `fluentci-module.toml`. A `latest` dependency stays at its
locked version on subsequent runs, even after the publisher releases an update.

## Run and update

Running a registry or Git module automatically creates missing lock entries:

```sh
fluentci run sccache build ...
fluentci @tsiry-sandratraina.com/sccache build ...
```

The second command works without `fluentci.toml` and locks the direct reference
in the detected workspace. Exact versions with or without `v` share a lock entry;
`@latest` and an omitted version share another entry.

Refresh dependencies deliberately:

```sh
fluentci update
fluentci update sccache
fluentci update @tsiry-sandratraina.com/sccache
```

Updates still honor exact requested versions. Git branches resolve to a new
commit only when updated; frozen or ordinary locked runs use the saved commit.

## Frozen CI runs

```sh
fluentci install --frozen-lockfile
fluentci run --frozen-lockfile sccache build ...
```

Frozen mode rejects a missing lockfile, missing dependencies, changed module
references, or incompatible entries. It does not rewrite `fluentci.lock`.
It may download missing artifacts or fetch the already locked Git commit; it is
not an offline mode. Cached registry artifacts are checked against their locked
SHA-256 before use. The registry is not queried again for a valid locked package.

Changing `FLUENTCI_REGISTRY_URL` requires refreshing registry entries with
`fluentci update`; a frozen run does not silently switch registries.

## File handling

The lockfile is versioned JSON with deterministic key ordering. Updates use an
advisory lock and atomic replacement so concurrent CLI processes cannot overwrite
one another's dependency additions. `fluentci.lock.guard` is a disposable local
coordination file; ignore it in Git, but commit `fluentci.lock`.

Cache locations can be overridden with `FLUENTCI_PACKAGE_CACHE` for registry
artifacts and `FLUENTCI_GIT_CACHE` for Git checkouts. Removing a cache does not
change locked versions or commits.
