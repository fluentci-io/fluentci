# FluentCI purescript component

This module uses native WIT components with WASI Preview 2. No Extism guest compiler is needed.
Edit the typed module functions; each build regenerates WIT and bindings from the source contract.
Unsupported or untyped contracts fail instead of generating guessed signatures.

```sh
npm install
npm run build
```

The output is `dist/plugin.wasm`. Run the module through FluentCI or publish the component.
See [the component guide](https://docs.fluentci.io/guides/components/) for supported types, host imports and toolchains.
