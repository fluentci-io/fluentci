#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
cargo fmt --all --check
cargo build --release --locked
cargo test --release --locked
cargo clippy --release --locked --all-targets -- -D warnings
