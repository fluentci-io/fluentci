# Native BSD releases

The single release workflow includes native x86_64 jobs matching fluentci-engine:

| Target | Guest | Compiler |
| --- | --- | --- |
| `x86_64-unknown-freebsd` | FreeBSD 14.3 | Official Rust 1.99.1 host tools |
| `x86_64-unknown-netbsd` | NetBSD 10.1 | Official Rust 1.99.1 host tools |
| `x86_64-unknown-openbsd` | OpenBSD 7.8 | Native Rust package, with dependencies compatible with Rust 1.90 |

Studio's Vite/React assets are built **once on Ubuntu**, then transferred as a
workflow artifact together with the compiled PureScript release module and Wasm
smoke fixtures. GitHub runners install the CLI with
the official `https://cli.fluentci.io` installer before module invocations.
Native BSD guests bootstrap the CLI without installing a Node runtime.
`FLUENTCI_VERSION` pins that bootstrap CLI;
`RELEASE_VERSION` identifies the new release being built. BSD guests invoke the
compiled module's `bsd-build` function and never install Bun, Node, Vite, React
build tools, or PureScript. Ubuntu invokes `bsd-verify` and `bsd-upload` after VM
copyback.

All CI modules are native Wasm components and require FluentCI 0.17.2 or newer.
OpenBSD bootstraps directly from the matching `fluentci-io/fluentci` release,
without running `install.sh`. Ubuntu verifies the archive checksum before
synchronizing the executable into the VM; OpenBSD verifies the binary again.
The bootstrap worker receives `bsd-build --target "$TARGET" --version "$RELEASE_VERSION"`.
Target and version are typed component arguments; credentials remain in the host
environment. Other BSD guests install the same `FLUENTCI_VERSION` through curl.

For a manual backport build, set `tag` to the existing release and `source-ref`
to the fixed source commit or branch. All jobs check out the same source ref,
and `BUILD-INFO.txt` records its commit. Leaving `source-ref` empty builds the
release tag as usual. Re-running an old workflow without the updated source
will still build the old code.

All native builds use `cargo build --release --locked`. FreeBSD and NetBSD host
toolchains are downloaded over HTTPS and verified against Rust's SHA-256
sidecars. BSD caches are separate from the Linux/macOS build caches. OpenBSD uses
the engine's vendored Extism compatibility runtime and Wasmtime 41.0.4. The
OpenBSD dependency graph is checked against Rust 1.90 before any builds run.
The non-OpenBSD runtime still requires a newer compiler; release jobs install it.

Before packaging, each native guest verifies CLI startup, real Wasm host imports,
Wasm unreachable and memory traps, shell pipeline execution, and SQLite project
persistence. NetBSD's per-executable PaX MPROTECT exemption is applied after strip
and before Wasm tests; system-wide policy and ASLR remain unchanged. The vendored
Wasmtime signal-context backport supports NetBSD's explicit trap checks.

Archives follow the installer's naming convention:

```text
fluentci_<tag>_x86_64-unknown-freebsd.tar.gz
fluentci_<tag>_x86_64-unknown-netbsd.tar.gz
fluentci_<tag>_x86_64-unknown-openbsd.tar.gz
```

Each has a `.sha256` sidecar and contains `fluentci`, source/toolchain/OS metadata,
runtime dependency information, and project/vendor licenses. These are dynamically
linked native executables: use the documented OS version and install the shared
libraries listed in `BUILD-INFO.txt`. OpenBSD releases do not guarantee ABI
compatibility with other OpenBSD versions.

After copyback, the Linux runner verifies checksums, safe archive paths, ELF
architecture, executable permissions, required licenses, and matching release
metadata before uploading to the existing GitHub release. No build failure is
silently skipped. Actual native BSD build and runtime validation happens in the
workflow; local checks do not substitute for those jobs.
