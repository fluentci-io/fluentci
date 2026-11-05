# Rust workflow

- Always build, run, and validate Rust code in release mode: use `cargo build --release --locked`, `cargo run --release`, `cargo test --release --locked`, and `cargo clippy --release`.
- Always run `cargo clippy --release --locked --all-targets -- -D warnings` after Rust changes. Check the sibling engine workspace as well when changing shared engine code.
- Do not run the `fluentci` CLI locally unless the user explicitly permits it.
- Build Studio assets with `cd webui && bun install --frozen-lockfile --ignore-scripts && bun run build:web` before compiling the CLI.
- Keep all `use` imports in one contiguous block. Add blank lines after that block and between functions, types, and implementations.
