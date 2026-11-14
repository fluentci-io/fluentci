#!/usr/bin/env bash
# Source in every step: Spindle starts each command in a fresh Bash process.
set -euo pipefail
export FLUENTCI_SPINDLE_ROOT
FLUENTCI_SPINDLE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
export PATH="$HOME/.local/bin:$PATH"
export BUN_INSTALL_CACHE_DIR="$FLUENTCI_SPINDLE_ROOT/.ci-cache/bun"
export RUNNER_TEMP="$FLUENTCI_SPINDLE_ROOT/.tangled-state/tmp"
(umask 077; mkdir -p "$RUNNER_TEMP")
if [[ -f "$FLUENTCI_SPINDLE_ROOT/.tangled-state/environment.sh" ]]; then
  source "$FLUENTCI_SPINDLE_ROOT/.tangled-state/environment.sh"
fi
# Nix does not read GH_TOKEN itself. Keep credentials out of manifests and logs.
if [[ -n "${GH_TOKEN:-}" && "${NIX_CONFIG:-}" != *"access-tokens = github.com="* ]]; then
  export NIX_CONFIG="${NIX_CONFIG:+$NIX_CONFIG$'\n'}access-tokens = github.com=$GH_TOKEN"
fi

fluentci_setup() {
  fluentci --check-update=false run "$@" |
    escript "$FLUENTCI_SPINDLE_ROOT/.github/scripts/fluentci_ci" export-spindle-env
  source "$FLUENTCI_SPINDLE_ROOT/.tangled-state/environment.sh"
}
