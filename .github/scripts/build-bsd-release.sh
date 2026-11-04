#!/bin/sh
set -eu
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
: "${TARGET:?TARGET is required}"
case "$RELEASE_VERSION" in ''|*[!A-Za-z0-9._+-]*) echo 'Unsafe release tag' >&2; exit 1 ;; esac
case "$(uname -s):$TARGET" in
    FreeBSD:x86_64-unknown-freebsd) native_curl=/usr/local/bin/curl ;;
    NetBSD:x86_64-unknown-netbsd) native_curl=/usr/pkg/bin/curl ;;
    OpenBSD:x86_64-unknown-openbsd) native_curl=/usr/local/bin/curl ;;
    *) echo 'Release target does not match the native guest' >&2; exit 1 ;;
esac
export PATH=/usr/local/bin:/usr/local/sbin:/usr/pkg/bin:/usr/pkg/sbin:/usr/bin:/usr/sbin:/bin:/sbin
repository=$PWD
output="$repository/dist/bsd/$TARGET"
mkdir -p "$output"
rm -f "$output/status" "$output/SKIPPED.txt"
. .github/scripts/bsd-rust-cache.sh
export CARGO_BUILD_JOBS=2
rust_version=${BSD_RUST_VERSION:?BSD_RUST_VERSION is required}
# Studio is built once on Ubuntu and synchronized into the native guest.
test -s "$repository/webui/dist/index.html"

if [ "$(uname -s)" = OpenBSD ]; then
    # OpenBSD uses the newest compiler shipped by its native package repository.
    # Its target-specific runtime dependencies are compatible with Rust 1.90.
    rust_version=$(rustc --version | awk '{print $2}')
    echo "Using native OpenBSD Rust $rust_version"
    runtime='Extism 1.21.0 / Wasmtime 41.0.4 (OpenBSD compatibility)'
else
    runtime='Extism 1.41.0 / Wasmtime 49.0.5 (NetBSD signal backport)'
    # FreeBSD and NetBSD have official Rust host-tool distributions.
    prefix="$repository/.ci-cache/bsd-rust/toolchains/$rust_version-$TARGET"
    if [ ! -x "$prefix/bin/rustc" ] || [ "$("$prefix/bin/rustc" --version | awk '{print $2}')" != "$rust_version" ]; then
        downloads="$repository/.ci-cache/bsd-rust/downloads"
        mkdir -p "$downloads"
        name="rust-$rust_version-$TARGET"
        archive="$downloads/$name.tar.xz"
        url="https://static.rust-lang.org/dist/$name.tar.xz"
        "$native_curl" --fail --location --proto '=https' --proto-redir '=https' --retry 3 --max-time 600 \
            --output "$archive.sha256" "$url.sha256"
        expected=$(awk 'NR == 1 {print $1}' "$archive.sha256")
        if [ ! -f "$archive" ] || [ "$(sha256 -q "$archive")" != "$expected" ]; then
            "$native_curl" --fail --location --proto '=https' --proto-redir '=https' --retry 3 --max-time 600 \
                --output "$archive.part" "$url"
            test "$(sha256 -q "$archive.part")" = "$expected"
            mv "$archive.part" "$archive"
        fi
        extracted=$(mktemp -d)
        # xz is provided by the base OS or the native package manager.
        xz -dc "$archive" | tar -xf - -C "$extracted"
        "$extracted/$name/install.sh" --prefix="$prefix" \
            --components="rustc,cargo,rust-std-$TARGET" --disable-ldconfig
        rm -rf "$extracted"
    fi
    export PATH="$prefix/bin:$PATH"
fi

test "$(rustc --version | awk '{print $2}')" = "$rust_version"
host=$(rustc -vV | sed -n 's/^host: //p')
test "$host" = "$TARGET"
git config --global --add safe.directory "$repository"
cargo build --release --locked -p fluentci
binary="$CARGO_TARGET_DIR/release/fluentci"
strip -s "$binary"
if [ "$(uname -s)" = NetBSD ]; then
    # Wasmtime generates code at runtime. Change this ELF's PaX MPROTECT
    # policy only, preserving ASLR/Segvguard and the system-wide defaults.
    # Apply after strip and before smoke tests, packaging, and checksums.
    /usr/sbin/paxctl -M +m "$binary"
    /usr/sbin/paxctl "$binary"
fi
"$binary" --version
"$binary" --help > /dev/null
sh .github/scripts/smoke-bsd-release.sh "$binary" "$repository/.release-smoke"

stage=$(mktemp -d)
cp "$binary" "$stage/fluentci"
cp LICENSE "$stage/LICENSE"
cp .github/BSD-RELEASES.md "$stage/README.md"
mkdir -p "$stage/licenses/superconsole" "$stage/licenses/wasmtime" "$stage/licenses/extism-openbsd"
cp engine/vendor/superconsole/LICENSE-* "$stage/licenses/superconsole/"
cp engine/vendor/wasmtime/LICENSE "$stage/licenses/wasmtime/LICENSE"
cp engine/vendor/extism-openbsd/LICENSE "$stage/licenses/extism-openbsd/LICENSE"
{
    printf 'Target: %s\nRelease tag: %s\nSource revision: %s\n' "$TARGET" "$RELEASE_VERSION" "$(git rev-parse HEAD)"
    "$stage/fluentci" --version
    printf 'Runtime: %s\n' "$runtime"
    uname -a
    rustc -vV
    cargo --version
    if [ "$(uname -s)" = NetBSD ]; then
        printf '\nNetBSD per-executable PaX policy (JIT requires MPROTECT exemption):\n'
        /usr/sbin/paxctl "$stage/fluentci"
    fi
    printf '\nDynamic dependencies (required on the destination host):\n'
    ldd "$stage/fluentci"
} > "$stage/BUILD-INFO.txt"
if grep -i 'not found' "$stage/BUILD-INFO.txt"; then
    echo 'Unresolved dynamic dependency; refusing to package' >&2
    exit 1
fi
asset="fluentci_${RELEASE_VERSION}_${TARGET}.tar.gz"
tar -czf "$output/$asset" -C "$stage" fluentci BUILD-INFO.txt README.md LICENSE licenses
printf '%s  %s\n' "$(sha256 -q "$output/$asset")" "$asset" > "$output/$asset.sha256"
rm -rf "$stage"
printf 'built\n' > "$output/status"
