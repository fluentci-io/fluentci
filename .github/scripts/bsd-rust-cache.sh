# Source from the repository root inside a BSD VM. The directory is synchronized
# back to the runner for actions/cache; never reuse Linux binaries in a guest.
export CARGO_HOME="$PWD/.ci-cache/bsd-rust/cargo"
export CARGO_TARGET_DIR="$PWD/.ci-cache/bsd-rust/target"
export CARGO_INCREMENTAL=0
# Packaged sccache can fail to spawn rustc on BSD (NetBSD: EBADF). Use Cargo's
# compiled artifact cache directly, even if a wrapper was inherited by the VM.
unset RUSTC_WRAPPER RUSTC_WORKSPACE_WRAPPER
unset SCCACHE_DIR SCCACHE_CACHE_SIZE SCCACHE_GHA_ENABLED
mkdir -p "$CARGO_HOME" "$CARGO_TARGET_DIR"
