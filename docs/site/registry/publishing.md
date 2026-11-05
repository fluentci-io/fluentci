---
title: "Publish a plugin"
description: "Validate a Wasm artifact, upload it or provide a public URL, then write plugin metadata to the publisher PDS."
section: "Studio and publishing"
url: "/registry/publishing/"
source: "registry/publishing.md"
---

## Set package metadata

Add metadata to each module in `fluentci.toml`:

```toml
[[modules]]
name = "ci"
path = ".fluentci/ci"
sdk = "clojurescript"
version = "1.0.0"
description = "Reusable build checks"
license = "MIT"
```

Names start with a lowercase letter and contain lowercase letters, digits, and
hyphens, up to 64 characters. Versions are valid SemVer, up to 128 characters;
`+build` metadata is rejected because it is incompatible with the chosen record
key. A non-empty license is required. Descriptions allow up to 2048 characters.
The selected module's Cargo manifest provides fallback version, description, and
license for Rust modules; explicit TOML metadata
makes the publishing intent clear.

## Choose an artifact source

After [setting account credentials](/registry/authentication/):

```sh
fluentci publish --module ci
fluentci publish --name hello-ci --file ./dist/plugin.wasm
fluentci publish --name hello-ci --url https://plugins.example/hello-ci.wasm
```

Use `--name` to override the published name. File and URL publishing require an
explicit name, provided with `--name` or entered at the prompt. `--version`,
`--description`, and `--license` override module metadata as well. Overrides apply
to the upload path and PDS record without modifying local configuration.

In an interactive terminal, missing metadata is requested with prompts, including
when a module's configuration is incomplete. Only name, version, and license are
required; press Enter to skip the optional description. The license prompt
suggests common SPDX identifiers as you type; use Tab to complete a selection
or enter a custom license value. Non-interactive runs
report missing required fields instead of prompting.

Use `--module ci --name public-ci --file ./dist/plugin.wasm` to select metadata
explicitly when publishing an artifact from a workspace with multiple modules.
Without a matching or selected module, provide metadata with flags or prompts:

```sh
fluentci publish --file ./dist/plugin.wasm \
  --name hello-ci --version 1.0.0 --license MIT
```

Without `--file` or `--url`, the CLI builds the selected module. `--file`
uses an existing artifact, and `--url` skips the S3 upload. The URL path must end
in `.wasm`, use HTTP(S), contain no credentials/query/fragment, and return exactly
HTTP 200. Redirect destinations are validated too. The CLI downloads and
validates the bytes even when upload is skipped.

Artifacts must be valid core Wasm modules of at most 64 MiB. Checksums and sizes
are verified. The upload response must match the artifact's SHA-256 and byte
length before metadata is published.

## Upload and PDS record

For uploaded artifacts, the CLI obtains short-lived service authentication scoped
to `io.fluentci.registry.publish`. The registry verifies it, stores immutable Wasm
bytes in S3, and returns a public URL, checksum, and size. The registry API does
not receive the app password.

The CLI then creates an `io.fluentci.plugin` record in the publisher's PDS with
`name`, `description`, `version`, `publishedAt`, `author`, `license`, `url`,
`sha256`, and `size`. The record key is `name-version`. Creation does not silently
overwrite a previously published release.

If storage succeeds but PDS creation fails, the object may exist without an
indexed package record. Check the error before retrying; upload and PDS write are
separate remote operations.

## Indexing and registry overrides

Jetstream indexes valid records asynchronously. A successful PDS write can take
a moment to appear in search. Missing historical events require a separate
backfill rather than assuming all past records were streamed.

Set `FLUENTCI_REGISTRY_URL` for a registry other than `https://api.fluentci.io`.
`FLUENTCI_REGISTRY_DID` must match that API's service DID when uploading. These
variables are distinct from the publisher's account DID.
