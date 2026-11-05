# FluentCI PureScript SDK

Write composable Wasm plugins for the non-containerized FluentCI engine.
`FluentCI.Plugin` builds immutable values with PureScript's `#` operator. Only
terminal `Effect` operations call the PDK functions exposed by the engine.

```purescript
import Prelude
import Effect (Effect)
import Data.Either (Either(..))
import Effect.Exception (throw)
import FluentCI.Plugin as P

greet :: Effect Unit
greet = do
  result <- P.pipeline "build"
    # P.withEnv "CI" "true"
    # P.exec ["/usr/bin/printf", "%s", "héllo 世界"]
    # P.stdout
  case result of
    Left error -> throw (P.errorMessage error)
    Right text -> do
      written <- P.output text
      case written of
        Left error -> throw (P.errorMessage error)
        Right _ -> pure unit
```

There is no `Aff` chain or HTTP client inside the guest. `exec` takes literal argv,
including the program; spaces, quotes, and shell metacharacters remain data. Use
`shell` explicitly when you want shell syntax.

## Choose an API

| Goal | Modules | Runtime |
| --- | --- | --- |
| Write a Wasm plugin | `FluentCI.Plugin`, `FluentCI.Plugin.Error` | Compiled with Extism's JavaScript guest compiler; engine supplies PDK imports |
| Submit a native execution plan | `FluentCI.Host.Plan`, `.Local`, `.Client` | Node.js locally or an authenticated `serve-runs` client |
| Maintain an existing GraphQL pipeline | Existing `FluentCI.Client`, `.Pipeline`, provider and Dagger modules | Compatibility JavaScript SDK/session runtime |

Host-plan and compatibility APIs remain available. They are not guest runtimes;
avoid importing their Node/HTTP bindings into a Wasm bundle. See
[existing API documentation](docs/legacy-and-host-apis.md).

## Install

Use PureScript 0.15.16, Spago 1.0.5, and Node.js 22.5 or newer:

```yaml
package:
  name: my-plugin
  dependencies: [prelude, effect, either, exceptions, fluentci]
workspace:
  packageSet:
    registry: 81.11.0
  extraPackages:
    fluentci:
      git: https://github.com/fluentci-io/purescript-fluentci.git
      ref: main
```

Pin an immutable commit instead of `main` and commit your application's
`spago.lock`. Guest modules do not require the npm `@fluentci/sdk` package.

## Guest primitives

Builders are pure, configuration-first functions with the pipeline last:

```purescript
build = P.pipeline "build"
  # P.using (P.Nix { impure: true })
  # P.withWorkdir "/workspace"
  # P.withCache "target" (P.cache "cargo")
  # P.withSecret "TOKEN" (P.secret "TOKEN" "supplied-at-runtime")
  # P.exec ["cargo", "build", "--release"]
```

- `pipeline`, `exec`, `shell`, `withWorkdir`, `withEnv`: reusable command values.
- `using`: typed `Native`, `Nix`, `Devbox`, `Devenv`, `Envhub`, `Flox`, `Hermit`,
  `Mise`, `Pixi`, `Pkgx`, and `Proto` providers.
- `withPackages`: Pkgx package installation; select `using Pkgx` first.
- `cache`/`withCache`: legacy cache mounts; these do not declare action-cache keys.
- `asService`/`withService`: reusable service values, deduplicated by value identity
  within one execution. `waitOn port timeoutSeconds` adds a legacy TCP wait.
- `file`, `copyFile`, `sha256`, `md5`: literal file copies and explicit hash effects.
- `secret`/`withSecret`: secret injection through engine handles. For remote secrets,
  `secretManager (Aws { region: "eu-west-1" })` and `getSecrets manager "name"`
  return typed handles. `Google`, `Azure`, and `Hashicorp` configurations are also
  available; authentication uses the engine provider's environment.
- `callModule path exportName input`: a nested plugin call with literal UTF-8 input.
- `getEnv`, `hasEnv`, `getOS`, `getArch`, `input`, `output`: explicit guest effects.

`validate` checks a pipeline and its service tree without calling the engine.
`stdout` and `stderr` return `Effect (Either PluginError String)`. Errors distinguish
`InvalidArgument`, `MissingHostFunction`, `InvalidHostResponse`, and `HostFailure`,
with the operation and message preserved. The previously minimal guest API returned
string errors; use `errorMessage` for display or pattern-match the constructors.

Secret values remain in guest memory until execution. Do not log or serialize
pipeline values. Secrets are lowered as opaque handles, not embedded in argv.
The SDK does not claim encrypted guest memory or automatic redaction of arbitrary
user-generated output.

## Compile to Wasm

PureScript compiles to JavaScript; bundle that output as ES2020 CommonJS with
esbuild, then compile it with [extism-js v1.7.0](https://github.com/extism/js-pdk).
The [engine's PureScript guest example](https://github.com/fluentci-io/fluentci-engine/tree/main/sdk/purescript/demo-plugin)
provides a complete build and invocation workflow:

```sh
npm ci
npm run build
fluentci-engine call -m dist/plugin.wasm greet 'hello from PureScript'
```

Declare plugin exports in a `main` module (`greet(): I32`) alongside the generated
host declarations in `schema/imports.d.ts`. Guest code runs in Extism's JavaScript
sandbox; Node/Deno OS APIs are unavailable there. The engine owns native execution.

## Compatibility limits

The guest targets the engine's compatibility PDK, which now routes execution
through the shared executor. Legacy commands remain serial; services retain the
five-second startup grace. Use explicit host plans for parallel `jobs`, protocol
readiness/health probes, declared action caching, and durable local/server history.
Guest PDK calls cannot provide independent concurrent graph sessions.

Legacy cache keys and paths require shell-safe characters because the legacy
backend interpolates them into shell commands. Arbitrary paths should use explicit
host-plan action caching. Cache handles are resolved before service/pipeline lowering because the legacy
`cache` import resets graph state. File copies use quoted native argv instead of
the legacy string-interpolated `with_file` command. File hash and nested plugin
calls are explicit effects that may reset the compatibility graph; call them
between terminal pipeline executions. Secret-manager access performs host I/O.

`Effect` terminals are synchronous guest calls, not independently cancelable `Aff`
fibers. Cancel the owning engine process/run to stop supervised tasks and services.
An engine-level cancellation or fatal Wasm trap may terminate the invocation before
it can return an `Either`; typed errors cover failures delivered to the guest.

## Development and ABI generation

```sh
python3 scripts/generate-pdk.py --check
node --test test/plugin_transport.mjs
spago build --pedantic-packages
spago test
node --test test/host_transport.mjs
```

`schema/host.json` is a pinned snapshot of the engine's canonical schema;
`schema/source.json` records its revision and SHA-256. The generator produces all
53 lazy host bindings and Wasm import declarations. To verify a sibling checkout:

```sh
python3 scripts/generate-pdk.py --check --engine ../fluentci-engine
```

When upgrading the ABI, copy the canonical schema, update the provenance revision
and digest, regenerate, and review the diff. No compiler or engine host runtime is
installed by the generator. CI compiles the PureScript API, checks generated files,
and exercises guest transports; engine CI compiles and invokes the real Wasm guest.

## Parallel matrices

`FluentCI.Matrix` expands named typed cases into ordinary host tasks. `product`
creates Cartesian products, `exclude` filters by a predicate, and `include`
appends explicitly named cases. IDs are stable across filtering/reordering.

```purescript
import Data.Tuple (Tuple(..))
import FluentCI.Matrix as M
import FluentCI.Host.Plan as H

jobs = do
  cases <- M.product (M.axis "node" ["22", "24"]) (M.axis "suite" ["unit", "integration"])
  M.matrix "test" cases \(Tuple node suite) ->
    H.task "assigned-by-matrix" "/usr/bin/printf" "."
      # H.withArgs ["%s %s", node, suite]

-- After handling the Either, run the complete plan in one guest effect:
-- P.runPlan "fresh-run-directory" (M.parallel 4 tasks)
```

Attach prerequisites in each task builder with `H.needs [prepare]`. Use
`M.after tasks finalTask` to join every case while preserving the final task's
existing dependencies. Each case gets normal per-task caching, services, logs,
timeouts and cancellation. Case builders must declare disjoint output paths or
resource dependencies; a matrix does not automatically isolate working directories.
Products and expansions are bounded to 4096 cases and reject duplicate keys.
`withJobs` limits the whole plan; there is no separate per-matrix quota yet.

`runPlan` calls the new `execute_plan` host import once for the complete plan,
without concurrent access to the legacy graph. It returns a typed terminal report;
inspect its outcome to decide whether the plugin should fail. The caller owns the
fresh run directory, journal, result and log files. Legacy `Pipeline` values remain
serial and are not accepted as native matrix tasks. All cases run on the current
host; remote/cross-OS worker placement is not provided.

This API requires FluentCI Engine 0.6.1 or later, which exposes `execute_plan`,
and a matching SDK.
