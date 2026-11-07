# WebAssembly components

FluentCI supports two Wasm execution paths: existing Extism core modules and native
WebAssembly components. Components execute directly in Wasmtime with WASI Preview 2
and versioned WIT host imports. Extism remains the default for existing SDK starters.
The runtime detects compiled artifacts by their binary encoding.

## Create a component module

```sh
fluentci init --runtime component
# Or add another module to an existing project:
fluentci modules add deploy --runtime component
```

All eight SDKs support component starters. Select a language explicitly:

```sh
fluentci modules add deploy --sdk purescript --runtime component
fluentci modules add tools --sdk python --runtime component
```

Component builds do not require Extism guest compilers. Rust and Elixir target
`wasm32-wasip2` using `wit-bindgen`; Python uses `componentize-py`; the JavaScript
language targets use ComponentizeJS. Generated WIT and bindings are build outputs,
not files developers must maintain.

```toml
[[modules]]
name = "main"
path = ".fluentci/main"
sdk = "rust"
runtime = "component"
```

An explicit `runtime = "component"` declaration rejects a core-Wasm artifact.
Existing modules without the field keep their current build behavior. Prebuilt
components can also be registered through `fluentci modules add` with `--path` or
`--url`, including components built by other language toolchains.

## Write typed functions, not duplicate WIT

Edit `src/jobs.rs`:

```rust
/// Greeting arguments.
pub struct HelloArgs {
    /// Name to greet.
    pub name: String,
}

/// Greet someone from a native component.
pub fn hello(args: HelloArgs) -> String {
    format!("Hello, {}!", args.name)
}
```

On every build, the inspection helper parses public job signatures and records,
generates WIT in Cargo's build output, and generates the native guest adapters.
Rust compiles the same functions used by those adapters. Keep record fields public
so adapters can construct them. Private helper functions are not exported.

Supported source types include owned scalars, concrete records, `Option`, `Vec`,
`Result`, and tuples. Unsupported or conditional declarations fail the build.
Source comments provide documentation; the generator does not invent descriptions
or infer behavior. Manual WIT remains available for custom interfaces.

## Automatic inspection in every SDK

| SDK | Source of signatures | Component compiler |
| --- | --- | --- |
| Rust | Parsed public functions and records in `src/jobs.rs`, checked by Rust compilation | `wit-bindgen`, `wasm32-wasip2` |
| TypeScript | TypeScript compiler type checker, including inferred return types | ComponentizeJS |
| PureScript | Fresh compiler `docs.json` and CoreFn exports | ComponentizeJS |
| Gleam | Fresh package interface and public record constructors | ComponentizeJS |
| ReScript | Compiler documentation for exported signatures and fields | ComponentizeJS |
| ClojureScript | Typed Clojure signatures, validated before ClojureScript compilation | ComponentizeJS |
| Python | AST annotations, local dataclasses/TypedDicts, aliases and docstrings | componentize-py |
| Elixir | The same compiled `defplugin` DSL declarations used to generate executable jobs | Rust component guest |

Every build regenerates WIT. Unsupported types, unresolved contracts, duplicate
WIT names, and untyped exports fail instead of generating guessed types. Python
needs explicit annotations; Elixir remains a CI DSL subset, not a general BEAM
compiler. JavaScript targets support concrete scalar/list/optional input fields;
return conversions support scalars, lists, and language-specific options/results.
Arbitrary classes, higher-order functions and promises are not exported.

Expose native return values from component functions. Extism `Host.outputString`,
`extism.output_str`, and raw `input()` calls are not component APIs. ClojureScript
initializes its compiled runtime lazily, after component instantiation, so compiler
snapshotting does not capture runtime random state. Elixir component pipelines and
`run_plan` return a structured execution report; legacy cache mounts must be
expressed as typed Host task cache policies.

Python example (`plugin.py`):

```python
from dataclasses import dataclass

@dataclass
class Args:
    name: str

def hello(args: Args) -> str:
    return f"Hello, {args.name}!"
```

TypeScript example (`entry.ts`):

```typescript
export function hello(args: { name: string }): string {
  return `Hello, ${args.name}!`;
}
```

WIT uses kebab-case identifiers. For example, a source field `source_dir` becomes
`source-dir` in WIT and `--source-dir` in the CLI; generated adapters convert it back
to the language's native field name.

```sh
fluentci run main hello --name Tsiry
fluentci run main --help
fluentci run main hello --help
```

The CLI derives parameter names, types, and return types from the compiled
component's WIT surface without instantiating it. A single record parameter is
exposed as flags for its fields. Other parameters become flags with their WIT
names. Booleans accept bare switches; lists, records, tuples, variants, and flags
use JSON values. Integer ranges follow their WIT type, including unsigned and
64-bit integers. Optional values may be omitted.

Functions exported through interfaces can be invoked by their unique short name.
When names collide, use `interface-name#function-name`. Resource methods and
resource handles are not standalone CLI jobs.

## FluentCI host capabilities

The SDK supplies `fluentci:runtime/host@0.1.0`; module authors do not maintain its WIT.
Rust bindings expose it as `crate::fluentci::runtime::host`:

- `get_env(name)` reads an invocation environment variable.
- `log(message)` writes to the invocation log.
- `execute_plan(plan, run_dir)` runs an existing protocol-v1 FluentCI plan and
  returns its JSON report, or an error.

Plans use the existing native DAG executor, including environments, cache policies,
services, lifecycle management, and composable primitives. The JSON payload is the
existing cross-language plan transport; execution still uses the compiled native
DAG. Failed executions retain structured diagnostics and cancellation propagates
to both the executor and running component code.

WASI exposes invocation environment variables, standard streams, and the current
project directory. This initial runtime targets synchronous WASI Preview 2
components; asynchronous WIT and CLI resource-handle arguments are not supported.

## Publishing and migration

Publishing uses the existing registry, immutable download URL, checksum, version,
and lockfile rules. The registry accepts component binaries as well as core Wasm.
Component function metadata uses `inputFormat: "wit"`; signatures come from WIT
and cannot be replaced by a conflicting metadata manifest. Help and the landing
page's Docs tab display that interface.

An Extism artifact is not a component and cannot be converted by changing the
runtime setting. Rebuild source against a component toolchain and publish a new
version. Existing Extism SDKs, host calls, and published modules remain supported
during the migration.
