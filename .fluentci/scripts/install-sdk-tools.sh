#!/bin/sh
# Only the Ubuntu job that compiles the PureScript modules needs these tools.
set -eu
case "$(uname -s):$(uname -m)" in
    Linux:x86_64) ;;
    *) echo 'Compile release modules on the Ubuntu x86_64 bootstrap job' >&2; exit 1 ;;
esac
npm install --global purescript@0.15.16 spago@1.0.5
version=v1.7.0
archive="extism-js-x86_64-linux-$version.gz"
directory=$(mktemp -d)
trap 'rm -rf "$directory"' 0
base="https://github.com/extism/js-pdk/releases/download/$version"
curl --fail --show-error --location --retry 3 "$base/$archive" -o "$directory/$archive"
curl --fail --show-error --location --retry 3 "$base/$archive.sha256" -o "$directory/$archive.sha256"
expected=$(awk 'NR == 1 {print $1}' "$directory/$archive.sha256")
actual=$(sha256sum "$directory/$archive" | awk '{print $1}')
test "$expected" = "$actual"
mkdir -p "$HOME/.local/bin"
gunzip -c "$directory/$archive" > "$HOME/.local/bin/extism-js"
chmod +x "$HOME/.local/bin/extism-js"
