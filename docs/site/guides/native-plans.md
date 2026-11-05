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

Host facts, digests, SSH, SCP, SFTP, rsync, FTP, FTPS, and S3 also compose as
tasks. See [host and transfer primitives](/guides/primitives/) for SDK entry
points, credentials, provisioning, and output bindings.

## Compiled execution

Native Rust callers can consume a `Plan` with `Plan::compile()` and retain the
resulting `CompiledPlan`. Compilation validates the plan and resolves dependency
names to numeric node indices. Dependencies and successors use contiguous
adjacency arrays; topological ordering is iterative, so a long dependency chain
does not require recursive traversal.

Ordinary success-dependent tasks use an incremental ready queue. Completion
unlocks successors instead of scanning every pending task on each pass. Plans
with output/artifact publication and allowed failures also use this queue. Plans
with services, caches, retries, resources, or finalizers
retain the general scheduler to preserve those semantics. Execution limits and
the cost of each task still matter; matrix expansion and filesystem contracts
need explicit bounds.

JSON remains the readable interchange and debugging format at plugin/API
boundaries. Native typed plans do not need a JSON round trip to compile or
execute. `CompiledPlan::debug_json()` produces JSON only when requested. Ordinary
compiled plans reuse their graph; workspace plans revalidate filesystem state
for each execution.

Cache action hashing streams a versioned MessagePack encoding into SHA-256,
alongside input and toolchain digests. This changes cache identities from the
previous JSON encoding, so existing entries are cold misses after upgrading.
Content-addressed cache blobs remain separate from graph scheduling. A Protobuf
transport and a portable content-addressed graph format are not implemented.

See the engine's [matrix guide](https://github.com/fluentci-io/fluentci-engine/blob/main/docs/matrix.md)
and [ClojureScript SDK reference](https://github.com/fluentci-io/fluentci-engine/blob/main/sdk/clojurescript/README.md)
for complete typed examples and limits.

## Performance measurements

A release-mode library comparison on macOS 15.6 (arm64, Rust 1.99.1) used seven
samples after one warmup. Graph construction for 100,000 nodes measured:

| Shape  | Previous median | Current median | Speedup |
| ------ | --------------: | -------------: | ------: |
| chain  |        10.37 ms |        4.79 ms |   2.17× |
| wide   |         4.24 ms |        2.72 ms |   1.56× |
| join   |        12.10 ms |        4.50 ms |   2.69× |
| layers |        58.08 ms |       25.81 ms |   2.25× |

Actual 64–256-command plans did not show a material execution speedup in these
cases. These timings include process execution, logging, and result publication;
the graph measurements exclude them. They do not establish a general application
speedup or identify a runtime bottleneck.

The reproducible harness and raw samples live in
`engine/crates/executor/benchmarks/`. Run the Python harness with an output path:

```sh
python3 engine/crates/executor/benchmarks/compare.py \
  --samples 7 --output /tmp/executor-comparison.json
```

It compares the baseline and current libraries in one release binary, runs strict
Clippy, records source/binary fingerprints, and validates results. It does not
launch the FluentCI CLI. See the harness README for measurement boundaries and
baseline selection.
