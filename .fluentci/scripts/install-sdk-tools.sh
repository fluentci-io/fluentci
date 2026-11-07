#!/bin/sh
# The Ubuntu jobs compile PureScript modules; other release hosts use their Wasm.
set -eu

require_tool() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Missing SDK bootstrap prerequisite: $1" >&2
        exit 1
    }
}

case "$(uname -s):$(uname -m)" in
    Linux:x86_64) ;;
    *) echo 'Compile CI modules on the Ubuntu x86_64 bootstrap job' >&2; exit 1 ;;
esac
for tool in node npm git curl sha256sum tar gunzip awk mktemp sudo; do
    require_tool "$tool"
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node 24 or newer is required for the CI SDK toolchain")'

# Native libraries used by the prebuilt PureScript compiler.
sudo apt-get update
sudo apt-get install --yes --no-install-recommends libgmp10 libtinfo6 libstdc++6
npm install --global purescript@0.15.16 spago@1.0.5

# ComponentizeJS and jco are pinned in each module's npm lockfile.
# No Extism compiler or Binaryen executables are needed for CI components.
for tool in node npm git purs spago; do
    require_tool "$tool"
    "$tool" --version
done
