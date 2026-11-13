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
curl -fsSL --retry 3 --connect-timeout 15 https://cli.fluentci.io -o "$RUNNER_TEMP/install-fluentci.sh"
sh "$RUNNER_TEMP/install-fluentci.sh"
fluentci_setup setup-node@v0.2.0 setup --version 24.22.2
if [[ $profile != npm ]]; then
  fluentci_setup setup-bun@v0.2.0 setup --version 1.4.3
fi
if [[ $profile == rust || $profile == component ]]; then
  fluentci_setup setup-rust@0.2.2 setup --toolchain stable --components rustfmt,clippy \
    --targets wasm32-unknown-unknown,wasm32-wasip2 --install-dir "$FLUENTCI_SPINDLE_ROOT/.ci-cache/rust-toolchain"
fi
if [[ $profile == rust || $profile == nix || $sdk == purescript ]]; then
  fluentci_setup setup-purescript@v0.2.0 setup --version 0.15.16 --spago-version 1.0.5 --node-version 24.22.2 --bun-version 1.4.3
fi
case "$sdk" in
  gleam) fluentci_setup setup-gleam@v0.2.0 setup --version 1.19.2 ;;
  elixir)
    fluentci_setup setup-erlang@v0.2.0 setup --version 28
    fluentci_setup setup-elixir@v0.2.0 setup --version 1.20.4 --otp-version 28
    ;;
  python) fluentci_setup setup-uv@v0.2.0 setup ;;
  clojurescript)
    fluentci_setup setup-java@v0.2.0 setup --version 21
    fluentci_setup setup-clojure@v0.2.0 setup --version 1.12.5.1654
    ;;
esac
if [[ $profile == api ]]; then
  fluentci_setup setup-gleam@v0.2.0 setup --version 1.19.2
  fluentci_setup setup-pkl@v0.2.0 setup --version 0.31.1
fi
