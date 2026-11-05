#!/bin/sh
# The Ubuntu jobs compile PureScript modules; other release hosts use their Wasm.
set -eu

require_tool() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Missing SDK bootstrap prerequisite: $1" >&2
        exit 1
    }
}

download_verified() {
    tool_url=$1
    tool_archive=$2
    curl --fail --show-error --location --retry 3 "$tool_url" -o "$tool_archive"
    curl --fail --show-error --location --retry 3 "$tool_url.sha256" -o "$tool_archive.sha256"
    tool_expected=$(awk 'NR == 1 {print $1}' "$tool_archive.sha256")
    tool_actual=$(sha256sum "$tool_archive" | awk '{print $1}')
    if [ "$tool_expected" != "$tool_actual" ]; then
        echo "SDK tool checksum mismatch: $tool_archive" >&2
        exit 1
    fi
}

case "$(uname -s):$(uname -m)" in
    Linux:x86_64) ;;
    *) echo 'Compile CI modules on the Ubuntu x86_64 bootstrap job' >&2; exit 1 ;;
esac
for tool in node npm git curl sha256sum tar gunzip awk mktemp sudo; do
    require_tool "$tool"
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node 24 or newer is required for the CI SDK toolchain")'

# Native libraries used by the prebuilt PureScript and Binaryen executables.
sudo apt-get update
sudo apt-get install --yes --no-install-recommends libgmp10 libtinfo6 libstdc++6
npm install --global purescript@0.15.16 spago@1.0.5

export PATH="$HOME/.local/bin:$PATH"
mkdir -p "$HOME/.local/bin"
directory=$(mktemp -d)
trap 'rm -rf "$directory"' 0

# extism-js requires both wasm-merge and wasm-opt from Binaryen.
binaryen_version=version_133
binaryen_archive="binaryen-$binaryen_version-x86_64-linux.tar.gz"
binaryen_url="https://github.com/WebAssembly/binaryen/releases/download/$binaryen_version/$binaryen_archive"
download_verified "$binaryen_url" "$directory/$binaryen_archive"
binaryen_prefix="$HOME/.local/share/fluentci-toolchains/binaryen-$binaryen_version"
mkdir -p "$binaryen_prefix"
tar -xzf "$directory/$binaryen_archive" -C "$binaryen_prefix" --strip-components=1
for tool in wasm-merge wasm-opt; do
    ln -sf "$binaryen_prefix/bin/$tool" "$HOME/.local/bin/$tool"
done

extism_version=v1.7.0
extism_archive="extism-js-x86_64-linux-$extism_version.gz"
extism_url="https://github.com/extism/js-pdk/releases/download/$extism_version/$extism_archive"
download_verified "$extism_url" "$directory/$extism_archive"
gunzip -c "$directory/$extism_archive" > "$HOME/.local/bin/extism-js"
chmod +x "$HOME/.local/bin/extism-js"

# Check actual executables, including shared-library loading, before compiling.
for tool in node npm git purs spago extism-js wasm-merge wasm-opt; do
    require_tool "$tool"
    "$tool" --version
done
