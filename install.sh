#!/bin/sh
set -eu

for fluentci_tool in curl tar install uname mktemp; do
    command -v "$fluentci_tool" >/dev/null 2>&1 || {
        echo "Error: $fluentci_tool is required" >&2
        exit 1
    }
done

case "$(uname -s)" in
    Darwin) fluentci_os=apple-darwin ;;
    Linux) fluentci_os=unknown-linux-gnu ;;
    FreeBSD) fluentci_os=unknown-freebsd ;;
    NetBSD) fluentci_os=unknown-netbsd ;;
    OpenBSD) fluentci_os=unknown-openbsd ;;
    *) echo "Unsupported operating system: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
    arm64|aarch64) fluentci_arch=aarch64 ;;
    x86_64|amd64) fluentci_arch=x86_64 ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac
fluentci_target="${fluentci_arch}-${fluentci_os}"
case "$fluentci_target" in
    x86_64-apple-darwin|aarch64-apple-darwin|x86_64-unknown-linux-gnu|aarch64-unknown-linux-gnu|x86_64-unknown-freebsd|x86_64-unknown-netbsd|x86_64-unknown-openbsd) ;;
    *) echo "No release binary is available for $fluentci_target" >&2; exit 1 ;;
esac

fluentci_version="${FLUENTCI_VERSION:-latest}"
if [ "$fluentci_version" = latest ]; then
    fluentci_latest_url=$(curl --fail --silent --show-error --head --location --retry 3 \
        --output /dev/null --write-out '%{url_effective}' \
        https://github.com/fluentci-io/fluentci/releases/latest)
    case "$fluentci_latest_url" in
        https://github.com/fluentci-io/fluentci/releases/tag/*)
            fluentci_version="${fluentci_latest_url##*/}" ;;
        *) echo "Error: could not resolve the latest FluentCI release" >&2; exit 1 ;;
    esac
fi
case "$fluentci_version" in
    ""|*[!A-Za-z0-9._+-]*) echo "Invalid FLUENTCI_VERSION: $fluentci_version" >&2; exit 1 ;;
esac
fluentci_asset="fluentci_${fluentci_version}_${fluentci_target}.tar.gz"
fluentci_url="https://github.com/fluentci-io/fluentci/releases/download/${fluentci_version}/${fluentci_asset}"
fluentci_install_dir="${FLUENTCI_INSTALL_DIR:-$HOME/.local/bin}"
fluentci_temp=$(mktemp -d)
trap 'rm -rf "$fluentci_temp"' 0
trap 'exit 1' HUP INT TERM

if command -v sha256sum >/dev/null 2>&1; then
    fluentci_hash_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then
    fluentci_hash_tool=shasum
elif command -v sha256 >/dev/null 2>&1; then
    fluentci_hash_tool=sha256
else
    echo 'Error: sha256sum, shasum, or sha256 is required' >&2
    exit 1
fi

echo "Downloading FluentCI $fluentci_version for $fluentci_target..."
curl --fail --show-error --location --retry 3 "$fluentci_url" -o "$fluentci_temp/$fluentci_asset"
curl --fail --show-error --location --retry 5 "$fluentci_url.sha256" -o "$fluentci_temp/$fluentci_asset.sha256"
fluentci_expected=$(awk 'NR == 1 { print $1 }' "$fluentci_temp/$fluentci_asset.sha256")
case "$fluentci_hash_tool" in
    sha256sum) fluentci_actual=$(sha256sum "$fluentci_temp/$fluentci_asset" | awk '{ print $1 }') ;;
    shasum) fluentci_actual=$(shasum -a 256 "$fluentci_temp/$fluentci_asset" | awk '{ print $1 }') ;;
    sha256) fluentci_actual=$(sha256 -q "$fluentci_temp/$fluentci_asset") ;;
esac
if [ "$fluentci_expected" != "$fluentci_actual" ]; then
    echo "Error: SHA-256 checksum mismatch for $fluentci_asset" >&2
    exit 1
fi

# Extract only the executable; BSD archives also contain release documentation.
tar -xzf "$fluentci_temp/$fluentci_asset" -C "$fluentci_temp" fluentci
mkdir -p "$fluentci_install_dir"
install -m 755 "$fluentci_temp/fluentci" "$fluentci_install_dir/fluentci"
echo "Installed FluentCI $fluentci_version to $fluentci_install_dir/fluentci"
echo "Ensure $fluentci_install_dir is on PATH, then run fluentci studio or fluentci init."
