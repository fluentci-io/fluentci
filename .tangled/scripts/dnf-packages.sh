#!/usr/bin/env bash
# Native AlmaLinux prerequisites only; safe to validate without running FluentCI.
set -euo pipefail
profile=${1:?Expected rust, component, web, api, npm, or nix}
sdk=${2:-}
case "$profile" in rust|component|web|api|npm|nix) ;; *) echo "Unknown bootstrap profile" >&2; exit 1 ;; esac
privilege=()
if [[ $(id -u) != 0 ]]; then
  command -v sudo >/dev/null || { echo 'AlmaLinux image needs passwordless sudo.' >&2; exit 1; }
  privilege=(sudo -n)
fi
command -v dnf >/dev/null || { echo 'This bootstrap requires a DNF-based image.' >&2; exit 1; }
"${privilege[@]}" dnf --refresh --assumeyes install dnf-plugins-core
"${privilege[@]}" dnf config-manager --set-enabled crb
"${privilege[@]}" dnf --assumeyes install epel-release
packages=(ca-certificates git python3 unzip xz zstd tar gzip bzip2 which findutils util-linux procps-ng)
if ! command -v curl >/dev/null; then packages+=(curl-minimal); fi
if [[ $profile == rust || $profile == component ]]; then
  packages+=(gcc gcc-c++ make cmake pkgconf-pkg-config openssl-devel clang clang-devel llvm-devel perl)
fi
if [[ $profile == rust ]]; then packages+=(rpm-build dpkg python3-pyyaml); fi
if [[ $sdk == elixir ]]; then packages+=(autoconf m4 ncurses-devel); fi
# Playwright's install-deps uses APT; provision its Chromium libraries natively.
if [[ $profile == web ]]; then
  packages+=(alsa-lib at-spi2-core cairo cups-libs dbus-libs expat
    fontconfig glib2 gtk3 libdrm libX11 libxcb libXcomposite libXdamage libXext
    libXfixes libXrandr libxkbcommon mesa-libgbm nspr nss pango liberation-fonts)
fi
"${privilege[@]}" dnf --assumeyes --setopt=install_weak_deps=False install "${packages[@]}"
