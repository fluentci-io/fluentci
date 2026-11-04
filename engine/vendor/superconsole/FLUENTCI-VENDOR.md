# Vendored SuperConsole 0.3.0

Source: https://github.com/facebookincubator/superconsole
Revision: `03aed03e41dff6ceaedc7d2bc2e37e63fd027c48`

This is a source snapshot of the unpublished 0.3.0 library, including the upstream
`src/`, Cargo manifest, README, changelog, and both license files. The upstream
repository's demos, CI configuration, and standalone lockfile are omitted.
Dependencies are resolved in FluentCI's root `Cargo.lock`.

Local changes are recorded in `fluentci.patch`:

1. Declare `nix` for **all Unix targets**, matching `src/stdin.rs`'s `cfg(unix)`
   RawReader implementation. Upstream declares it only for Linux/macOS, leaving
   FreeBSD, NetBSD, and OpenBSD with an unresolved import. Only `fs` is enabled;
   the obsolete `nix 0.24` event API is not used.
2. Disable Crossterm's default features and enable only `serde` and Windows
   rendering support. SuperConsole does not read Crossterm keyboard events, so
   the renderer needs no event poller or signal-hook-mio dependency.
3. Remove the nested workspace declaration so the crate joins FluentCI's workspace.
4. Publish the patched fork as `fluentci-superconsole` while retaining the
   `superconsole` library name, so crates.io consumers receive the same BSD fixes.
5. Add a Unix RawReader regression test using a socket pair to verify binary
   data and EOF. CI runs this and the upstream library tests on Linux, both macOS
   architectures, FreeBSD, NetBSD, and OpenBSD with `--release --locked`.

To refresh, check out the desired upstream revision, copy the same source files,
then apply/rebase `fluentci.patch`. Preserve the license files and update the
revision above. Review the diff, update the root lockfile, and run the native CI
matrix. Do not overwrite this directory with a floating GitHub branch.

No native BSD build result is implied by this source patch; the GitHub Actions
VM jobs provide that validation.
