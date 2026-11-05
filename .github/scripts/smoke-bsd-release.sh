#!/bin/sh
set -eu
binary=$1
fixtures=$2
workspace=$(mktemp -d "$PWD/.bsd-release-smoke.XXXXXX")
trap 'rm -rf "$workspace"' EXIT
unset FLUENTCI_PROJECT_ID
export FLUENTCI_BSD_SMOKE=bsd-release-smoke

echo 'Smoke: linked Wasm runtime and FluentCI host imports'
result=$("$binary" --check-update=false --database "$workspace/state.db" run --wasm "$fixtures/host_import.wasm" env_roundtrip)
test "$result" = "$FLUENTCI_BSD_SMOKE"
for trap in unreachable memory_oob; do
    echo "Smoke: Wasm $trap trap diagnostics"
    if "$binary" --check-update=false --database "$workspace/state.db" run --wasm "$fixtures/$trap.wasm" "$trap" > "$fixtures/$trap.log" 2>&1; then
        echo "Wasm $trap unexpectedly succeeded" >&2
        exit 1
    fi
    case "$trap" in
        unreachable) expected='wasm `unreachable` instruction executed' ;;
        memory_oob) expected='out of bounds memory access' ;;
    esac
    grep -F "$expected" "$fixtures/$trap.log" || { cat "$fixtures/$trap.log" >&2; exit 1; }
done

echo 'Smoke: native pipeline execution and SQLite persistence'
(
    cd "$workspace"
    cat > fluentci.toml <<'TOML'
[[steps]]
name = "smoke"
command = "printf bsd-release-smoke > artifact"
TOML
    "$binary" --check-update=false --database "$workspace/state.db" run
    test "$(cat artifact)" = "$FLUENTCI_BSD_SMOKE"
    "$binary" --check-update=false --database "$workspace/state.db" project create
    "$binary" --check-update=false --database "$workspace/state.db" project list | grep -F 'project-'
)
