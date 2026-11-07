---
title: "Module dependencies"
description: "Install reusable modules, own their metadata, and call dependencies through Extism or typed component interfaces."
section: "Build pipelines"
url: "/guides/module-dependencies/"
source: "guides/module-dependencies.md"
---

## Give each module its own manifest

Put `fluentci-module.toml` at the root of a module, alongside its SDK sources.
New module starters create this file automatically.

```toml
name = "deploy"
version = "0.1.0"
license = "MIT"
description = "Build and deploy the application"
sdk = "typescript"
runtime = "component"
repository = "https://github.com/example/pipelines"
readme_url = "https://raw.githubusercontent.com/example/pipelines/main/README.md"
logo = "https://example.com/deploy.png"
topics = ["deployment", "build"]
os = ["linux", "macos"]
arch = ["aarch64", "x86_64"]

[dependencies]
math = { path = "../math" }
```

The manifest owns publishing metadata and build settings: `name`, `version`,
`license`, `description`, `repository`, `readme_url`, `logo`, `topics`, `os`,
`arch`, `sdk`, `runtime`, `entry`, `artifact`, `build`, and optional function
metadata. Description, URLs, and classification fields remain optional. Name,
version, and license are required when publishing.

A workspace can continue declaring `[[modules]]` in `fluentci.toml`. Its `name`
is a local alias and its `path` locates the source; the module manifest supplies
the module's own metadata and SDK settings. Versions belong to each module,
not `package.version`.

## Add and install modules

Run `fluentci add` from the directory containing `fluentci-module.toml`:

```sh
# Official publisher: the @fluentci.io scope may be omitted.
fluentci add sccache@v0.1.0

# Another publisher, with an explicit local alias.
fluentci add @tsiry-sandratraina.com/sccache@v0.1.0 --alias compiler-cache

# A local source module or prebuilt Wasm file.
fluentci add math --path ../math
fluentci add math --path ./artifacts/math.wasm

# A direct Wasm URL.
fluentci add math --url https://example.com/math.wasm

# A source module inside a Git monorepo.
fluentci add math --git https://github.com/example/modules --rev main --subdir modules/math
```

`add` preserves manifest comments, updates `[dependencies]`, installs the dependency,
and updates `fluentci.lock`. A failed install restores the manifest declaration.
The CLI adds `/fluentci_modules/` to the module's `.gitignore`.

For a module cloned from Git, install the dependencies already declared in its
manifest:

```sh
fluentci install
fluentci install --frozen-lockfile
fluentci update
```

Registry references accept exact versions or `latest`; omitting a version requests
`latest`. SemVer ranges are not supported. `latest` remains pinned until an explicit
update. Registry artifacts are verified by SHA-256; Git sources are pinned to a
commit; direct URL dependencies are also pinned by checksum.

Commit `fluentci-module.toml` and `fluentci.lock`. Do not commit `fluentci_modules/`
or generated `.fluentci/dependencies/` bindings. Local path dependencies remain
local source references, so their source changes are rebuilt.

## Inspect and run a dependency

An installed alias can be used directly from the module root:

```sh
fluentci run math --help
fluentci run math add --help
fluentci run math add --left 20 --right 22
fluentci run --frozen-lockfile math add --left 20 --right 22
```

These commands use the declared dependency and its lock entry. They do not resolve
an unrelated registry package with the same alias. Function arguments and return
types come from the compiled module's metadata or WIT interface.

## Import a component dependency from code

A component module depends on another **component**, with an exported WIT interface.
SDK components export `api`; an external component can export a single unambiguous
interface. Core Extism Wasm cannot satisfy a native WIT component import.

For example, the Rust `math` module can define these jobs:

```rust
pub struct AddArgs {
    pub left: u32,
    pub right: u32,
}

pub fn add(args: AddArgs) -> u32 {
    args.left + args.right
}
```

Install it with `fluentci add math --path ../math`. FluentCI extracts the dependency's
actual WIT, generates import bindings before building the parent, and connects the
import to the dependency's exported interface. Developers do not copy or maintain
that WIT manually.

### TypeScript

```typescript
import { add } from "fluentci:dependency/math";

export function sum(): number {
  return add({ left: 20, right: 22 });
}
```

The CLI generates TypeScript declarations in `fluentci_modules/imports.d.ts`;
compiler inspection includes these declarations. New TypeScript component starters
include the generated declarations in `tsconfig.json` automatically. Existing
projects should add `"fluentci_modules/**/*.d.ts"` to their `include` list.

### Rust

```rust
use crate::fluentci::dependency_math::math;

pub fn sum() -> u32 {
    math::add(math::AddArgs { left: 20, right: 22 })
}
```

The namespace and record types come from generated `wit-bindgen` imports.

### Python

```python
from wit_world.imports import math

def sum() -> int:
    return math.add(math.AddArgs(left=20, right=22))
```

`componentize-py` generates the imported interface and its record classes. For
PureScript, Gleam, ReScript, and ClojureScript, a JavaScript FFI bridge can import
`fluentci:dependency/math` through the same component build adapter.

Before execution or publishing, FluentCI type-checks and composes the dependency
into the parent component. The resulting Wasm is self-contained: consumers do not
need the publisher's source paths or `fluentci_modules/` directory. Transitive
component dependencies are composed as they are built. Incompatible interfaces
and source dependency cycles fail before executing module functions.

The FluentCI host package remains **`fluentci:runtime@0.1.0`**. A module release's
version is separate from the WIT host API version.

## Editor autocomplete

After `fluentci add` or `fluentci install`, TypeScript editors can complete exported
functions from `fluentci:dependency/<alias>`, show argument and return types, and
report incorrect calls. These declarations are derived from the installed
component's WIT, including function documentation; no handwritten signature file
is required. Run `fluentci update` to refresh a dependency and regenerate its types.

Rust imports are generated by `wit-bindgen` during the component build. Use
rust-analyzer with build scripts enabled and the `wasm32-wasip2` target. Python's
import modules are generated by `componentize-py` during the build; make its
generated binding directory available to the editor's Python analysis path.
FluentCI does not currently generate native editor declarations for Extism's
string-based `callModule` API, or separate language-server stubs for every SDK.

## Call an Extism dependency from code

Extism uses the existing SDK module-call operation with the dependency alias as
its module argument. For example, using the PureScript guest SDK:

```purescript
import Effect (Effect)
import FluentCI.Plugin as P

restore :: Effect (P.Result String)
restore = P.callModule "compiler-cache" "restore" "{}"
```

Use the callee's actual input contract; `restore` here is an example function name.
For a typed JSON export, pass its JSON input object. For a legacy text export,
pass its text input. The module's help lists the supported functions and fields.

The equivalent Rust SDK call is:

```rust
let output = fluentci_pdk::dag().call(
    "compiler-cache",
    "restore",
    vec![r#"{}"#],
)?;
```

The compiled parent carries its dependency artifacts in a portable Wasm custom
section. Nested calls resolve aliases in the callee's own dependency scope, so
transitive dependencies do not accidentally use a parent's aliases. Calls share
the invocation's host execution context. An Extism caller can also invoke a
component dependency through the host-call compatibility path; native component
imports use the typed composition path described above.
