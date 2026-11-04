# FluentCI Studio

Studio is the React frontend embedded in the Rust FluentCI binary. The Rust Axum
server provides GraphQL, WebSocket events, and web assets on one origin.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build:web
```

Build the CLI from the repository root with `cargo build --release --locked`,
then start Studio with `fluentci studio`.

For frontend development, start `cargo run --release -- server` from the repository
root and `bun run dev` here. Vite proxies API and event requests to port 6076.
`bun run test -- run` runs the frontend tests. See [the imported source notes](UPSTREAM.md)
for provenance and licensing.
