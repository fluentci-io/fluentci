---
title: "Troubleshooting"
description: "Resolve common discovery, compiler, Wasm, account and local API problems."
section: "Reference"
url: "/reference/troubleshooting/"
source: "reference/troubleshooting.md"
---

## Command not found

Add `~/.local/bin` to PATH after installing. Run `fluentci --version` in the
same shell or runner step that will launch the pipeline. GUI apps can have a
different PATH from interactive shells.

## Missing SDK tools

Read the full missing-tool list before retrying. A CLI installation is not a
PureScript, Clojure, Python, or Elixir compiler installation. For ClojureScript,
check JDK 21+, Clojure CLI, Node/npm, extism-js, wasm-merge, and wasm-opt. For
ReScript, allow project npm dependencies to install the local compiler.

## No module or an ambiguous selector

Inspect `fluentci.toml` from the discovered workspace root. Module paths resolve
from that file, including when it lives under `.fluentci`. Run
`fluentci modules --json`, then call a declared name explicitly. Source discovery
can trigger builds; do not assume it will succeed without compiler tools.

## Build succeeds but a job is missing

Check the language export, wrapper, and `imports.d.ts` declaration for
JavaScript-based guests. ClojureScript needs the job in the `.cljc` namespace,
`src/main/entry.cljs`, `entry.mjs`, and interface declaration. Rebuild and inspect
exports instead of calling a helper function that was never exported to Wasm.

## Starter fails at git status

The pipeline example inspects a Git workspace. Run `git init` in a scratch
project or invoke it from an existing repository. A compiler success does not
mean every host command can succeed in every directory.

## Not logged in

Set both `FLUENTCI_ACCOUNT` and `FLUENTCI_APP_PASSWORD` in the invoking process.
Use a valid PDS app password. A remembered `account.json` is identity only, not
saved credentials. There is no `fluentci login` command for this flow.

## Publish URL rejected

Use an HTTP(S) URL ending in `.wasm`, with no credentials, query, or fragment.
It must return exactly HTTP 200 and valid Wasm of at most 64 MiB. Redirect targets
must meet the same URL rules. A signed URL with query parameters is not accepted
by this publishing path.

## Published record is not searchable yet

Confirm the PDS write succeeded, then allow asynchronous indexing. Inspect
Jetstream connectivity and registry logs. Multiple sources help availability;
they do not reconstruct events beyond upstream replay retention. A package must
have matching author DID, canonical record key, valid metadata, checksum, and URL.

## Studio port or project history confusion

Choose another CLI port with `studio --port 6080`. Desktop uses an independent
OS-assigned port. Compare the database paths used by the processes before
assuming data disappeared. Changing `FLUENTCI_DATABASE` selects different local
history.

## Registry startup fails

Startup lists missing or invalid settings before opening SQLite or networking.
Set the required `S3_BUCKET` and `S3_PUBLIC_URL` for the API server, and configure
AWS credentials or a provider-chain identity. The standalone indexer does not
require upload settings. Use a persistent SQLite file with FTS5 support.

## Collect a useful report

Include CLI version, OS/architecture, selected SDK, a minimal configuration,
command, and relevant stderr. Remove app passwords, storage keys, private tokens,
and sensitive logs before opening an issue. `RUST_LOG=debug` can help local
investigation. Report issues in the [repository](https://github.com/fluentci-io/fluentci/issues).
