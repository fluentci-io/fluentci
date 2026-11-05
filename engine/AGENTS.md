# Rust workflow

- Build and validate Rust in release mode with locked dependencies.
- Always run `cargo clippy --release --locked --workspace --all-targets -- -D warnings` after Rust changes and fix reported issues.
- Run `cargo fmt --all --check` after Rust changes. Use each crate's declared edition when formatting individual files; Superconsole uses Rust 2024.
- Run relevant tests with `cargo test --release --locked`.
- Keep shared engine and SDK sources synchronized with the FluentCI repository's `engine/` and bundled SDK templates.
- Do not run the `fluentci` CLI locally unless the user explicitly permits it.
