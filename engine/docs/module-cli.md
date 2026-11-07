# Typed module arguments (v1)

New SDK starters derive function metadata from the same source compiled into Wasm.
Use one concrete typed argument record for each new public function. The build
inspects its fields, optionality, source documentation, and return type, then
embeds a `fluentci:metadata` custom section. Generated wrappers decode and validate
JSON before calling the native function. Rust uses Extism's `Json<Args>` decoder;
Elixir generates its decoder from the DSL declarations.

```ts
interface BuildArgs {
  /** Source directory. */
  src: string;
  /** Build concurrency. */
  jobs?: number;
}

/** Build source files. */
export function build(args: BuildArgs): string {
  return `Building ${args.src} with ${args.jobs ?? 1} jobs`;
}
```

```sh
fluentci run main build --src demo --jobs 4
fluentci run main --help
fluentci run main build --help
```

The argument contract is generated on every SDK build; no second handwritten
signature list is needed. JavaScript-based builds and Python also write an
artifact-checksummed `dist/fluentci.metadata.json` sidecar. Help and publishing
read the embedded contract without instantiating the guest.

| SDK           | Inspection and native input                                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust          | `syn` parses `#[plugin_fn]` signatures and named struct fields during `build.rs`. Use `Json<Args>`, `String`, `i32`, floats, `bool`, `Vec<T>`, and `Option<T>`. Rustdoc supplies descriptions; supported Serde `rename` and `default` attributes are honored.                             |
| PureScript    | Compiler `docs.json` supplies source types and comments; CoreFn verifies the compiled exports. A closed record such as `{ src :: String, jobs :: Maybe Int }` becomes named flags. The generated wrapper constructs `Maybe` values and executes `Effect` thunks.                          |
| TypeScript    | The TypeScript compiler API resolves exports, aliases, record properties, JSDoc, optional fields, and inferred returns. The generated wrapper passes the validated object directly.                                                                                                       |
| Python        | The standard AST parser reads `@extism.plugin_fn` functions, dataclasses or `TypedDict` fields, docstrings, and return annotations without importing user code. A generated zero-argument ABI wrapper constructs the typed record. Python requires explicit field and return annotations. |
| Gleam         | `gleam export package-interface` supplies typed function signatures, aliases, public record constructors, and documentation. Wrappers construct native records, `List`, and `Option` values.                                                                                              |
| ReScript      | `rescript-tools doc` reads the compiled interface, retaining `int` versus `float`, optional record fields, descriptions, and return types. Primitive records and arrays use their native JavaScript representation.                                                                       |
| Elixir        | The same immutable DSL declarations drive metadata and Rust guest generation. Use `argument("src")` or `argument("jobs", "integer")`; `@doc` and `@param` document exports and fields. The generated guest returns `String`.                                                              |
| ClojureScript | The native source reader inspects the export map, `defn` documentation, and Typed Clojure signatures checked before compilation. Accept one concrete `HMap` with mandatory/optional keyword fields. The runtime wrapper converts validated JSON into a keyword map.                       |

Source types must be concrete. Unsupported, ambiguous, generic, or nested input
representations fail the build instead of inventing a signature. Documentation
comes from source comments; it is not inferred from a function's behavior. Existing
zero-argument ABI exports that read raw input retain text-mode behavior, because
source types cannot reveal arbitrary parsing performed inside those functions.

For existing projects, adopt the starter's updated build tooling. Rust needs the
`fluentci-inspection` build dependency, the `generate` call in `build.rs`, and
`include!(concat!(env!("OUT_DIR"), "/fluentci_metadata.rs"));` in `src/lib.rs`.
The module's `Cargo.toml` must keep the helper outside its workspace:

```toml
[workspace]
exclude = [".sdk/inspection/rust"]
```

ClojureScript entrypoints must expose the internal `__fluentci_invoke` bridge from
`fluentci.inspection/invoke!` as shown in the starter. Existing hosted Wasm needs
to be rebuilt and republished to acquire source signatures.

## Advanced: explicit metadata

Custom compilers can still supply a manifest using this standard wire format:

```json
{
  "functions": [
    {
      "name": "build",
      "description": "Build a source directory.",
      "inputFormat": "json",
      "args": [
        { "name": "src", "type": "string", "description": "Source directory." },
        {
          "name": "jobs",
          "type": "integer",
          "description": "Build concurrency."
        },
        {
          "name": "verbose",
          "type": "boolean",
          "required": false,
          "description": "Enable verbose logs."
        },
        {
          "name": "tags",
          "type": "string[]",
          "required": false,
          "description": "Build tags."
        }
      ],
      "returnType": "string"
    }
  ]
}
```

`fluentci run` automatically embeds this file when preparing a declared source
module. The same fields can be declared with `[[modules.functions]]` and
`[[modules.functions.args]]` in `fluentci.toml`. `input_format` is also accepted in TOML.

For artifacts built directly by **any SDK compiler**, embed the manifest once:

```sh
fluentci modules embed dist/plugin.wasm --manifest fluentci.metadata.json
# Preserve the original file:
fluentci modules embed dist/plugin.wasm --manifest fluentci.metadata.json --output plugin.wasm
fluentci run ./plugin.wasm build --src demo --jobs 4 --verbose --tags '["ci","rust"]'
fluentci run ./plugin.wasm --help
fluentci run ./plugin.wasm build -h
```

The build function receives exactly:

```json
{ "src": "demo", "jobs": 4, "verbose": true, "tags": ["ci", "rust"] }
```

Flags accept `--src demo` and `--src=demo`; boolean switches accept `--verbose`,
`--verbose=false`, or `--verbose false`. Required arguments default to `true`.
Optional fields are omitted when not provided; modules choose their own defaults.
Positional values are also bound in declaration order. `--` ends flag parsing.
Use `--src=--literal` for a string beginning with `--`. Unknown, duplicate, missing,
or mistyped arguments fail before guest execution. Strings retain spaces, quotes,
newlines, and shell metacharacters without evaluation.

Types are SDK-neutral: `string`, `boolean`, `integer` (signed 32-bit), `number`
(finite double), and `string[]`, `boolean[]`, `integer[]`, `number[]`. Arrays use JSON
syntax. Null is not a scalar value; use an optional argument to omit a field.
Source-language types on text-mode functions remain descriptive metadata.
`returnType` documents the result; it does not change a module's output encoding.

## Runtime contract

The CLI validates names and scalar types before instantiating Wasm. It passes one
UTF-8 JSON object through Extism input; each generated SDK wrapper validates it
again before calling user code. Optional keys are omitted so native defaults or
`Maybe`/`Option`/`None` handling can apply. An explicit manifest cannot change a
signature already embedded by a typed build; mismatches require rebuilding.

## Publishing and help

Publishing uploaded Wasm embeds verified metadata before hashing and upload.
`publish --manifest fluentci.metadata.json` also works without a project config.
When publishing an existing external URL, upload/host an embedded artifact for
self-describing URL calls. Registry calls can also read the published metadata
and attach it to a verified cached copy without changing the hosted artifact.
Published `io.fluentci.plugin` records retain argument descriptions, required flags,
input format, and return types. The landing page's Docs tab renders the same data.

The JSON Schema is `schema/module-cli.schema.json` in fluentci-engine.
Metadata is read without instantiating the guest; exported function names and ABI
are always verified against the actual Wasm artifact.
