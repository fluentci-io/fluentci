# Imported engine source

Source: https://github.com/fluentci-io/fluentci-engine
Commit: badf6717073b124cd8f4e09fc6909185bba36274

The engine crates and existing vendored runtime patches are copied here so this
repository builds independently of sibling checkouts. Their licenses are retained.
The workspace omits examples that are not required by the CLI. A small library
entry point in `crates/cli/src/lib.rs` exposes the existing command implementations and typed execution errors.
The unified CLI calls the engine library through its own internal worker mode.

Shared executor, primitive, PDK, and SDK changes are synchronized with the sibling
checkout using `python3 scripts/sync-engine.py --write`; run without `--write` to
check for drift. These include typed native transfer/digest operations, compiled
dependency graphs, incremental scheduling, and versioned binary action hashing.
The imported workspace and CLI library wrapper remain local integration.

Root `cargo fmt`, Clippy and tests
apply to the new application crate. Engine files and provider caches retain their
upstream formats; application database persistence is exclusively SQLx/SQLite.

The AWS SDK baseline is pinned to the sibling engine's OpenBSD-compatible
`aws-config` 1.5.5 and `aws-sdk-s3` 1.45.0. The root lockfile constrains their
transitive dependencies to Rust 1.90-compatible releases. The OpenBSD runtime
selection and NetBSD Wasmtime signal-context patch remain unchanged.

The ClojureScript SDK source and its static checker fixtures are embedded in
`../templates/sdk/clojurescript/.sdk/clojurescript/` at this revision. The engine
vendor source is unchanged since the previous imported revision. Current shared
crate and SDK work is maintained in both local checkouts pending upstream release.
