# Vendored Wasmtime 49.0.5

Source: the published `wasmtime` 49.0.5 crate from crates.io.
Upstream source revision: `805a0f15320e8836cf2b9f001b53d884bf866c89`
(`crates/wasmtime` in https://github.com/bytecodealliance/wasmtime).

The published Cargo manifests, license, README, build script, library source,
tests, and proptest regressions are preserved. The separate published lockfile
is omitted; FluentCI's root lockfile resolves all dependencies. This crate is
excluded from the engine workspace and selected through `[patch.crates-io]`.
The other Wasmtime crates retain their registry versions and checksums.

The only upstream source change is the unmodified build-script backport from
[65c224427136898e44e9be58e6ab4538cfe2f064](https://github.com/bytecodealliance/wasmtime/commit/65c224427136898e44e9be58e6ab4538cfe2f064):
“Don't use native signals on Unix targets without signal context support”.
The exact diff is retained in `netbsd-signals.patch` and applies directly to
49.0.5's build script.

Previously all Unix targets enabled native signal handling, but `signals.rs`
has no NetBSD register-context implementation and emits a compile error there.
The patch enables signals only on implemented OS/architecture pairs. NetBSD uses
Wasmtime's existing explicit trap checks; FreeBSD/OpenBSD x86_64 retain their
native signal handlers. Explicit checks can be slower than signal-based traps;
this backport does not change the dependency versions, plugin ABI, or SDK API.

The BSD release jobs exercise real plugins and require both `unreachable` and
out-of-bounds memory traps to fail correctly before creating release assets.
The Linux/macOS native matrix also rebuilds against this patched source.

To refresh: obtain and verify the published crate, copy the same files, rebase or
remove the backport when it is included upstream, update the root lockfile, and
run the native release/host CI matrices. Preserve the upstream license. Keep
this source pinned; do not replace it with a floating Git checkout.
