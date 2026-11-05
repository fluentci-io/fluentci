# OpenBSD-compatible Extism 1.21.0

Source: the published `extism` 1.21.0 crate from crates.io.
Published archive SHA-256: `ed8c5859bdab81d2eb4cd963eeacd8031d353b1ffb2fde43ee9179a0d6295120`.
The BSD-3-Clause license is preserved in `LICENSE` from the upstream v1.21.0 tag.

The Cargo package name changes to `fluentci-extism-openbsd`; the preserved
upstream `Cargo.toml.orig` is excluded from republication because Cargo reserves
that filename for its own generated manifest. The library
implementation, bundled Extism kernel, and build script are unchanged. This
allows the workspace to select Extism 1.21.0 on OpenBSD alongside the current
Extism 1.41.0 selection for other targets, without conflicting exact constraints
on the same registry package. The crate is excluded from workspace members.
The CLI/shared crates alias this dependency to `extism` on OpenBSD.

Extism 1.21 selects Wasmtime 41.0.4, the latest 41.x patch in the root lockfile,
whose declared MSRV is Rust 1.90. Extism 1.41/Wasmtime 49 require a newer compiler
than the one distributed by OpenBSD 7.8. FreeBSD, NetBSD, Linux, and macOS keep
the current runtime. The Rust PDK and XTP wire contracts remain unchanged.

`.github/scripts/check-openbsd-msrv.py` verifies the selected OpenBSD graph and
its declared compiler requirements without compiling. Native BSD release smoke
tests verify plugin calls, host imports, Wasm traps, and native cached execution
before packaging. These source checks do not replace an actual OpenBSD build.

Refresh from a checksum-verified published crate, preserve the license, repeat
the Cargo package rename, and update both target selectors and the root lockfile.
Move OpenBSD back to the current runtime when its native compiler can support it.

The FluentCI fork is published as `fluentci-extism-openbsd` 1.21.1; its upstream
base remains Extism 1.21.0.
