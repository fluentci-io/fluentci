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
repository = "https://github.com/example/pipelines.git"
subdir = "modules/ci"
```

Names start with a lowercase letter and contain lowercase letters, digits, and
hyphens, up to 64 characters. Versions are valid SemVer, up to 128 characters;
`+build` metadata is rejected because it is incompatible with the chosen record
key. A non-empty license is required. Descriptions allow up to 2048 characters.
Set `version` directly on each `[[modules]]` entry. Publishing never uses
`package.version` from a global configuration or Cargo manifest. Override it with
`--version`, or enter it when prompted if the module version is missing.
The selected module's Cargo manifest can provide fallback description and license.

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

## Source repository and monorepo directory

Each module may set optional `repository` and `subdir` fields. Git source modules
publish their `git` URL as the repository when no explicit override is set.
`--repository URL` and `--subdir PATH` provide publishing overrides. Subdirectories
must stay inside the repository: absolute paths and parent traversal are rejected.

These optional fields are part of `io.fluentci.plugin`, survive SQLite indexing,
and appear in registry responses. `fluentci docs` uses them to find the module's
`README.md` and render it with `glow` when available. They describe the source;
the registry still distributes the verified Wasm artifact.

## Functions, arguments, and return types

Publishing inspects the actual Wasm exports for every SDK: Rust, PureScript,
ClojureScript, TypeScript, Python, Gleam, Elixir, and ReScript. Records include a
`functions` array with each job's `name`, `wasmParams`, and `wasmResults`. Wasm
ABI types describe the compiled boundary, not the JSON values passed through
Extism input/output. Missing source-level `args` or `returnType` means unknown.

Describe the public job inputs and output on its module, using the same format
for every SDK:

```toml
[[modules]]
name = "sccache"
path = ".fluentci/sccache"
sdk = "purescript"
version = "0.1.1"
license = "MIT"

[[modules.functions]]
name = "build"
description = "Build a project with compiler caching"
args = [{ name = "arguments", type = "Array String" }]
returnType = "String"
```

The declarations document the job's contract; they do not change its implementation.
PureScript jobs that read `P.input` must describe that input explicitly: an
`Effect Unit` wrapper does not reveal the JSON argument names or result type.

For files or URLs, pass `--module sccache` to use its declarations, or supply
an SDK-independent JSON manifest with `--manifest plugin.metadata.json`:

```json
{
  "functions": [
    {
      "name": "build",
      "args": [{ "name": "arguments", "type": "Array String" }],
      "returnType": "String"
    }
  ]
}
```

SDK tools may embed the same JSON in a `fluentci:metadata` Wasm custom section.
Explicit `--manifest` overrides module declarations, which override embedded
metadata. A file manifest may include `sha256` to bind it to an artifact.
Publishing rejects references to missing exports, duplicate names, invalid fields,
and mismatched checksums. ABI types always come from the Wasm artifact.

Registry search, get, and list responses preserve the function metadata through
SQLite indexing. Older records remain readable without `functions`. Existing
published releases are immutable; publish a new version with the updated CLI
and declarations to add function metadata.

## Indexing and registry overrides

Jetstream indexes valid records asynchronously. A successful PDS write can take
a moment to appear in search. Missing historical events require a separate
backfill rather than assuming all past records were streamed.

Set `FLUENTCI_REGISTRY_URL` for a registry other than `https://api.fluentci.io`.
`FLUENTCI_REGISTRY_DID` must match that API's service DID when uploading. These
variables are distinct from the publisher's account DID.

## Optional module logo

Set `logo = "https://cdn.example/plugin.png"` in the selected `[[modules]]`
entry, or pass `--logo URL` when publishing. FluentCI requests the URL and requires
HTTP 200 and an `image/*` Content-Type before uploading or writing the record.
The URL is stored as optional `logo` metadata; it is not copied into S3.
Studio displays it beside module suggestions and falls back to a module icon if
it cannot load. Existing records without a logo remain valid.
