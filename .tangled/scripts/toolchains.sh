#!/usr/bin/env bash
# Shared by the APT and DNF bootstraps; profile and sdk are set by the caller.
curl -fsSL --retry 3 --connect-timeout 15 https://cli.fluentci.io -o "$RUNNER_TEMP/install-fluentci.sh"
sh "$RUNNER_TEMP/install-fluentci.sh"
# Bootstrap known prefixes without depending on the helper being compiled yet.
fluentci --check-update=false run @fluentci.io/setup-erlang@0.2.0 setup --version 27 --install-dir "$RUNNER_TEMP/fluentci-ci-erlang"
export PATH="$RUNNER_TEMP/fluentci-ci-erlang/bin:$PATH"
fluentci --check-update=false run @fluentci.io/setup-gleam@0.2.0 setup --version 1.17.0 --install-dir "$RUNNER_TEMP/fluentci-ci-gleam"
export PATH="$RUNNER_TEMP/fluentci-ci-gleam/bin:$PATH"
(cd "$FLUENTCI_SPINDLE_ROOT/.github/scripts" && gleam export escript)
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
