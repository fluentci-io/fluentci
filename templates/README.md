# SDK scaffolds

These templates adapt the plugin examples and required SDK source from
fluentci-engine commit 340e066502e4a7e21274fb122d607fd6f491419e. They are embedded
in the CLI so generated projects do not depend on a sibling repository checkout.
Rust is generated directly in `src/scaffold.rs`. Other SDKs include a small
`hello` export and, where needed, local SDK source under `.sdk/`.

The ClojureScript starter tracks engine commit
`badf671` and bundles the SDK, static checker and negative type fixtures. Its
`.cljc` source is checked through Typed Clojure before JavaScript/Wasm compilation.
Run `fluentci init --sdk clojurescript` or
`fluentci modules add ci --sdk clojurescript` to scaffold it. Builds require JDK
21+, Clojure CLI, Node/npm, extism-js and Binaryen; the starter pins Clojure CLI in `mise.toml`.

The JavaScript-based templates use the engine examples' esbuild → extism-js
pipeline. Install the documented language compiler and Extism guest compiler
before building. Python uses uv and fluentci-plugin; Elixir uses the supported
FluentCI DSL and generated Rust, rather than embedding a BEAM runtime.
