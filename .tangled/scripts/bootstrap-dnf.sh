#!/usr/bin/env bash
# AlmaLinux 10 base prerequisites use DNF; toolchains use FluentCI components.
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
profile=${1:?Expected rust, component, web, api, npm, or nix}
sdk=${2:-}
bash "$FLUENTCI_SPINDLE_ROOT/.tangled/scripts/dnf-packages.sh" "$profile" "$sdk"
source "$FLUENTCI_SPINDLE_ROOT/.tangled/scripts/toolchains.sh"
