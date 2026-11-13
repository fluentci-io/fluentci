#!/usr/bin/env bash
# Only base OS prerequisites use APT; language toolchains use registry components.
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
profile=${1:?Expected rust, component, web, api, npm, or nix}
sdk=${2:-}
case "$profile" in rust|component|web|api|npm|nix) ;; *) echo "Unknown bootstrap profile" >&2; exit 1 ;; esac
privilege=()
if [[ $(id -u) != 0 ]]; then
  command -v sudo >/dev/null || { echo 'Ubuntu image needs passwordless sudo.' >&2; exit 1; }
  privilege=(sudo -n)
fi
packages=(ca-certificates curl git python3 unzip xz-utils zstd)
if [[ $profile == rust || $profile == component ]]; then
  packages+=(build-essential cmake pkg-config libssl-dev clang libclang-dev)
fi
if [[ $profile == rust ]]; then packages+=(rpm dpkg-dev python3-yaml); fi
if [[ $sdk == elixir ]]; then packages+=(autoconf m4 libncurses-dev); fi
"${privilege[@]}" env DEBIAN_FRONTEND=noninteractive apt-get update
"${privilege[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends "${packages[@]}"
source "$FLUENTCI_SPINDLE_ROOT/.tangled/scripts/toolchains.sh"
