# Wasmtime WASI 41.0.4: OpenBSD compatibility

This directory contains the published `wasmtime-wasi` 41.0.4 source, under its
upstream Apache-2.0 WITH LLVM-exception license. Only the OpenBSD component
runtime uses this path dependency; other targets keep Wasmtime WASI 49.0.5.

OpenBSD does not expose the TCP keepalive idle/interval/count socket options used
unconditionally by upstream's WASI sockets implementation. `rustix` correctly
excludes those getters and setters on OpenBSD, preventing upstream from compiling.

The local changes are limited to `src/sockets/tcp.rs` and `src/sockets/util.rs`:

- Keep the existing implementations behind `cfg(not(target_os = "openbsd"))`.
- Return WASI `not-supported` for those options on OpenBSD.
- Preserve the WASI `invalid-argument` response for zero setter values.
- Leave basic `SO_KEEPALIVE` enable/disable support and other networking intact.

The upstream package version remains 41.0.4 and supports Rust 1.90. There is no
registry-cache mutation or build-time source patching. Remove this fork when a
compatible upstream release includes equivalent OpenBSD handling.
