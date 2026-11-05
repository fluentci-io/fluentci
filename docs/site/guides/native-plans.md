---
title: "Native plans and matrices"
description: "Compose task graphs and typed matrix cases while keeping execution in the host scheduler."
section: "Build pipelines"
url: "/guides/native-plans/"
source: "guides/native-plans.md"
---

## Two composition layers

An SDK pipeline composes operations that execute through the engine. Native host
plans describe tasks, dependencies, resources, retries, services, and caches as a
whole graph. The engine owns scheduling and cancellation; plugins do not run a
thread per matrix member against one mutable pipeline.

Native plan support is provided by the embedded engine's `execute_plan` API.
Use matching SDK versions and engine capabilities. Engine-specific commands from
other repositories are not automatically top-level `fluentci` commands.

## Build a task

In a checked ClojureScript namespace, add `fluentci.host` as `h` and Typed Clojure
as `t`:

```clojurescript
#?(:clj (t/ann check-task [-> h/Task]))
(defn check-task []
  (-> (h/task "check" "/usr/bin/printf" ".")
      (h/with-args ["%s" "ready"])
      (h/with-timeout 10000)))
```

Constructing a task or compiling a plan does not execute its commands. Terminal
calls such as `h/run!` or `p/run-plan!` submit a plan. The engine performs
preflight validation before launching tasks. Give each invocation a fresh run
directory for logs and its result journal.

## Compose a matrix

The SDK's `fluentci.matrix` namespace provides named axes, Cartesian products,
include/exclude operations, and dependency helpers. This expression describes
four combinations without provisioning their runtimes:

```clojurescript
(m/product (m/axis "node" ["22" "24"])
           (m/axis "suite" ["unit" "integration"]))
```

A matrix builder receives each typed case and returns a native task.
`m/parallel` sets process concurrency. Labels are identifiers, not installers:
a `node=24` case still needs a command/environment that selects Node 24.

## Workflow features

Native SDK APIs include retry policies, success/failure conditions, allowed
failure, outputs, artifacts, output environment variables, exclusive and shared
resources, and service health probes. Filesystem task constructors can operate
without a shell. Cache keys and relocatable output contracts remain explicit.

See the engine's [matrix guide](https://github.com/fluentci-io/fluentci-engine/blob/main/docs/matrix.md)
and [ClojureScript SDK reference](https://github.com/fluentci-io/fluentci-engine/blob/main/sdk/clojurescript/README.md)
for complete typed examples and limits.
