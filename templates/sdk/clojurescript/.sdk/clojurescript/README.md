# ClojureScript SDK

Immutable pipelines, literal argument vectors, ordinary function composition and
thread-first (`->`) chaining. Persistent tagged maps distinguish `Pipeline`,
`File` and `Secret`. Builders perform no I/O; terminal functions end in `!`.

```clojure
(ns my.plugin
  (:require [fluentci.plugin :as p]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann release [p/Pipeline -> p/Pipeline]))
(defn release [pipeline] (p/env pipeline "MODE" "release"))

#?(:clj (t/ann build [t/Str -> t/Str]))
(defn build [directory]
  (-> (p/pipeline "build")
      release
      (p/workdir directory)
      (p/cache "cargo" "target")
      (p/exec ["cargo" "build" "--release"])
      p/stdout!))
```

## Static typing

Write checked code in `.cljc`. The mandatory build first checks the **JVM view of
the shared source** with Typed Clojure 1.4.0, then compiles its ClojureScript view
using ClojureScript 1.12.145. All SDK and example functions have explicit static
signatures. Ten negative fixtures cover invalid argv, resource types, pipeline
composition, plan limits, workflow conditions, providers, file bytes, matrix
builders and raw PDK requests. These checks run before JavaScript or Wasm compilation.

This is not a general static type checker for arbitrary `.cljs` code. Keep logic
in shared `.cljc`, without platform-specific branches. The guest bridge, generated
PDK bindings, wire/report decoders and CommonJS export shim are the trusted FFI
boundary. Decoders validate values before returning them to typed code. Compiled
JS contracts cover all 53 PDK imports; real Wasm engine tests cover execution.
Annotations are erased from guest code; there is no Typed Clojure runtime in Wasm.

Consumer projects should include their namespaces in `clojure -M:check`, as the
[ported hash plugin](../../examples/hash-clojurescript/README.md) does. The checker
alias sets `typed.clojure.preserve-check-ns-after-opt-in=true` so checks cannot
silently skip namespaces. Adding arbitrary `.cljs` code bypasses this model.

## Setup and build

Requires JDK 21+, Node.js, mise, extism-js (CI pins 1.7.0), Binaryen and the
FluentCI engine. Clojure CLI **1.12.5.1654** is pinned in `mise.toml`; Maven
dependencies are pinned in `deps.edn`, and npm dependencies in `package-lock.json`.

```sh
cd sdk/clojurescript
mise trust
mise install clojure
mise exec -- clojure -M:check
mise exec -- clojure -M:test
node build/tests.cjs
cd demo-plugin
npm ci
mise exec -- npm run build
fluentci-engine call -m dist/plugin.wasm greet 'hello from ClojureScript'
```

The build is shared source → static check → JavaScript → esbuild CommonJS →
extism-js → `demo-plugin/dist/plugin.wasm`. The guest imports engine PDK functions
through `Host` and `Memory`; it embeds no Node, HTTP client or Extism host runtime.
`imports.d.ts` is generated from `schema/host.json`.

## API

| Pure operation | Signature |
| --- | --- |
| `pipeline` | `Str -> Pipeline` |
| `exec` | `Pipeline, Vec<Str> -> Pipeline` |
| `shell`, `workdir` | `Pipeline, Str -> Pipeline` |
| `env`, `cache` | `Pipeline, Str, Str -> Pipeline` |
| `file` | `Str -> File` |
| `secret` | `Str, Str -> Secret` |
| `with-secret` | `Pipeline, Str, Secret -> Pipeline` |
| `copy-file`, `with-file` | `Pipeline, File, Str -> Pipeline` |
| `using` | `Pipeline, Provider, Bool -> Pipeline` |
| `with-packages` | `Pipeline, Vec<Str> -> Pipeline` |
| `trust`, `install` | `Pipeline -> Pipeline` |
| `wait-on` | `Pipeline, Int, Int -> Pipeline` |
| `as-service` | `Pipeline, Str -> Service` |
| `with-service` | `Pipeline, Service -> Pipeline` |

`stdout!`/`stderr!` execute a pipeline; `sha256!`/`md5!` hash a file;
`call-module!` calls a nested plugin. All return strings. `input!` reads the guest
request, and `output!` writes a string response. Host failures throw `ex-info`
with `:kind :host-error` and the PDK `:function`; process exit codes propagate
through the engine. Empty argv and NUL-containing arguments fail at construction.
`exec` preserves literal arguments, including quotes, spaces and shell metacharacters;
`shell` explicitly opts into shell syntax. Unix commands/quoting are used.

`fluentci.plugin` also exposes directory listing, HTTP downloads, chmod, zip/tar
creation and extraction, Git trees/commits, process environment, OS/architecture,
and secret managers. Legacy providers are `:nix`, `:flox`, `:devbox`, `:devenv`,
`:envhub`, `:hermit`, `:mise`, `:pixi`, `:pkgx` and `:proto`. `using`'s boolean is
Nix's impure option. Dependencies still need to fit the Extism sandbox.

## Native host plans and small combinators

`fluentci.host` exposes the native executor's complete plan/task fields:

- Tasks: `task`, `with-id`, `with-args`, `with-env`, `after` (merge dependencies),
  `needs` (replace dependencies), `with-timeout`, `with-resource-wait-timeout`.
- Workflow: `retry`, `retry-policy`, `with-retry`, `when-task` (`:success`,
  `:failure`, `:always`, `:never`), `always`, `allow-failure`, `output`, `artifact`,
  `output-env`, `resource`, `with-resources`, `with-shared-resources`, `env-file`.
- Cache: `cache`, `with-cache`, `with-toolchain-files`, `with-relocatable-cache`.
- Services: `probe`, `service`, `with-health`, `with-service-limits`, `as-service`.
- Native packages: `provider`, `with-provider-executable`, `install`,
  `with-package-environment`. Managers are `:homebrew`, `:macports`, `:freebsd`,
  `:netbsd`, `:openbsd`; backends are `:native` and MacPorts-only `:rust`.
- Plans: `plan`, `with-jobs`, `with-max-services`, `with-fail-fast`,
  `with-cache-directory`, `with-resource-directory`, `with-workspace`,
  `with-inherit-env`, `validate`, `compile`, `run!`, `succeeded?`.

`fluentci.files` provides all 16 native filesystem task constructors: `read-text`,
`read-bytes`, `write-text`, `write-bytes`, `copy-file`, `copy-tree`, `move`, `mkdir`,
`remove`, `stat`, `exists`, `list-entries`, `glob`, `hash`, `chmod`, `symlink`.
Arguments start with a task ID and end with cwd; limits and overwrite/recursive
flags are explicit. They compose with all host-task helpers. File queries return
`:file_result`; no shell is involved.

Only `run!`/`plugin/run-plan!` invokes `execute_plan`; constructing/compiling a
plan performs no I/O. `compile` validates basic structure; the engine performs
authoritative preflight validation before starting tasks. Results have typed
outcomes/statuses, outputs, artifacts, attempts, cache diagnostics, signals, file
values and probe logs. Job failure returns a failed report; request/ABI failure
throws. Callers own a **fresh** run directory and retain logs/result.json.

## Matrices

`fluentci.matrix` provides polymorphic `named`, `axis`, `product`, `include`,
`exclude`, `matrix`, `after`, and `parallel`. Configuration types flow into the
case builder; it must return a native `Task`. Names/duplicates/4096-case limits
are checked before invoking builders; IDs use stable RFC3986-escaped labels.

```clojure
(ns my.matrix
  (:require [fluentci.host :as h] [fluentci.matrix :as m]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann jobs [-> (t/Vec h/Task)]))
(defn jobs []
  (m/matrix "test"
    (m/product (m/axis "node" ["22" "24"])
               (m/axis "suite" ["unit" "integration"]))
    (fn [[node suite]]
      (-> (h/task "assigned-by-matrix" "/usr/bin/printf" ".")
          (h/with-args ["%s/%s" node suite])))))

;; One host call executes the whole matrix with two process slots:
;; (h/run! (m/parallel (jobs) 2) "fresh-run-directory")
```

See the [matrix execution guide](../../docs/matrix.md) for prerequisites, joins,
cache contracts and cancellation. Native matrices do not concurrently mutate
the legacy pipeline graph. Labels do not install runtimes or provision machines.

## Complete low-level PDK

[`fluentci.pdk`](API.md) exposes **all 53 canonical PDK imports**, with generated
static signatures, JSON validation and `!` names. It is an effectful interface to
the legacy current graph, useful when a builder convenience does not apply.
`with-exec!` is the raw shell-word protocol; prefer `plugin/exec` for literal argv.
Bindings, wire types, ABI fixtures and the coverage table are generated together
by `python3 scripts/xtp_codegen.py`; `--check` detects drift.

Host HTTP clients, local JVM process adapters and journal readers are separate
execution transports, not guest PDK imports, and are outside this Wasm SDK.
See [demo-plugin](demo-plugin/README.md) and the complete
[hash port](../../examples/hash-clojurescript/README.md).
