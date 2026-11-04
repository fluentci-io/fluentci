#!/usr/bin/env bash
set -euo pipefail

for tool in curl tar; do
    command -v "$tool" >/dev/null || { echo "Error: $tool is required" >&2; exit 1; }
done
case "$(uname -s)" in
    Darwin) fluentci_os=apple-darwin ;;
    Linux) fluentci_os=unknown-linux-gnu ;;
    *) echo "Unsupported operating system" >&2; exit 1 ;;
esac
case "$(uname -m)" in
    arm64|aarch64) fluentci_arch=aarch64 ;;
    x86_64) fluentci_arch=x86_64 ;;
    *) echo "Unsupported architecture" >&2; exit 1 ;;
esac
fluentci_target="${fluentci_arch}-${fluentci_os}"
fluentci_version="${FLUENTCI_VERSION:-$(curl -fsSL https://api.github.com/repos/fluentci-io/fluentci/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')}"
[ -n "$fluentci_version" ] || { echo "Could not determine latest release" >&2; exit 1; }
fluentci_asset="fluentci_${fluentci_version}_${fluentci_target}.tar.gz"
fluentci_temp=$(mktemp -d)
trap 'rm -rf "$fluentci_temp"' EXIT
curl -fSL "https://github.com/fluentci-io/fluentci/releases/download/${fluentci_version}/${fluentci_asset}" -o "$fluentci_temp/$fluentci_asset"
tar -xzf "$fluentci_temp/$fluentci_asset" -C "$fluentci_temp"
fluentci_install_dir="${FLUENTCI_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$fluentci_install_dir"
install -m 755 "$fluentci_temp/fluentci" "$fluentci_install_dir/fluentci"
echo "Installed FluentCI to $fluentci_install_dir/fluentci"
echo "Ensure $fluentci_install_dir is on PATH, then run fluentci studio or fluentci init."
