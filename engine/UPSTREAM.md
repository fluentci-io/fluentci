# Imported engine source

Source: https://github.com/fluentci-io/fluentci-engine
Commit: 340e066502e4a7e21274fb122d607fd6f491419e

The engine crates and existing vendored runtime patches are copied here so this
repository builds independently of sibling checkouts. Their licenses are retained.
The workspace omits examples that are not required by the CLI. A small library
entry point in `crates/cli/src/lib.rs` exposes the existing command implementations and typed execution errors.
The unified CLI calls the engine library through its own internal worker mode.

Engine source otherwise remains upstream code. Root `cargo fmt`, Clippy and tests
apply to the new application crate. Engine files and provider caches retain their
upstream formats; application database persistence is exclusively SQLx/SQLite.

The AWS SDK baseline is pinned to the sibling engine's OpenBSD-compatible
`aws-config` 1.5.5 and `aws-sdk-s3` 1.45.0. The root lockfile constrains their
transitive dependencies to Rust 1.90-compatible releases. The OpenBSD runtime
selection and NetBSD Wasmtime signal-context patch remain unchanged.
