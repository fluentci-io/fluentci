# ClojureScript plugin

Requires JDK 21+, Clojure CLI, Node/npm, `extism-js` and Binaryen (`wasm-merge`,
`wasm-opt`). `mise.toml` pins the
Clojure CLI version used upstream; use `mise install clojure` if needed.

```sh
npm ci
npm run build
```

The build checks `src/main/plugin.cljc` and the bundled SDK with Typed Clojure,
compiles ClojureScript, bundles JavaScript and produces `dist/plugin.wasm`.
Static type checks are mandatory and run before compilation. Shared `.cljc`
source is checked through its JVM view; arbitrary `.cljs` code is not checked.

From the workspace root, run `fluentci run main hello` (replace `main` with the
configured module name). Keep the `hello` export in `entry.mjs` and
`src/main/entry.cljs` aligned when adding jobs. All SDK source is bundled under
`.sdk/clojurescript`; no sibling checkout is needed.
