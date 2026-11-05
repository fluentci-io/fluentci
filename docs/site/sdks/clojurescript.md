---
title: "ClojureScript"
description: "Thread immutable pipelines through checked shared source, then compile ClojureScript to Wasm."
section: "Language SDKs"
url: "/sdks/clojurescript/"
source: "sdks/clojurescript.md"
---

## Create a module

```sh
fluentci init --sdk clojurescript
# Or add to an existing workspace:
fluentci modules add ci --sdk clojurescript
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `src/main/plugin.cljc`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```clojurescript
(ns ^:typed.clojure main.plugin
  (:require [fluentci.plugin :as p]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann hello [-> nil]))
(defn hello []
  (-> (p/pipeline "hello")
      (p/exec ["echo" "Hello from FluentCI"])
      (p/exec ["git" "status" "--short"])
      p/stdout!
      p/output!))
```

The -> macro threads the immutable pipeline through each function. Terminal functions end in !.

## Static checks and the shared source model

Requires JDK 21+, Clojure CLI, Node/npm, extism-js, and Binaryen (`wasm-merge`,
`wasm-opt`). `mise.toml` pins the upstream Clojure CLI. The starter bundles the SDK
under `.sdk/clojurescript`, including the checker and negative type fixtures.

`npm run build` first runs `clojure -M:check`, then compiles ClojureScript,
bundles CommonJS with esbuild, and invokes extism-js. Static checks are mandatory;
compiler output is not produced by bypassing the checked source stage.

The JVM view of shared `.cljc` is checked with Typed Clojure. Keep checked logic
in shared source and add explicit annotations. Arbitrary `.cljs` files are not
covered by a universal ClojureScript type checker. The guest bridge and generated
PDK bindings form a trusted FFI boundary; annotations are erased from the guest.

## Export and execute

The starter exports `hello` through three aligned declarations:
`src/main/plugin.cljc`, `src/main/entry.cljs`, and `entry.mjs`. Its `imports.d.ts`
module declaration must also list `hello` for the Wasm compiler. Update all
required layers when adding a job, then inspect the compiled exports.

Terminal functions end in `!`; `stdout!` executes and `output!` returns data to
the caller. Builder functions such as `exec` use literal argument vectors.
The bundled SDK also includes host plans, native filesystem tasks, matrices,
services, secrets, and all canonical PDK imports.

## Run and inspect

```sh
fluentci run main hello
fluentci modules main --json
```

Use the configured module name instead of `main` if it was added as `ci`.
CLI invocation builds the source module before running it. The resulting artifact
is normally `dist/plugin.wasm`.

Continue with [workspace modules](/guides/modules/) for custom builds and artifact
paths, or [publishing](/registry/publishing/) to share the compiled plugin.

## Host and transfer tasks

The bundled SDK includes composable OS/architecture detection, SHA-256/SHA-512,
SSH, SCP, SFTP, rsync, FTP/FTPS, and S3 tasks. See the
[primitive guide](/guides/primitives/) for this SDK’s entry point and example,
plus provisioning, credential, cancellation, and caching behavior.
