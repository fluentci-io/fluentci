# FluentCI engine architecture

FluentCI executes programmable CI/CD pipelines through a shared Rust engine.
Language SDKs describe work; the native executor validates dependencies, schedules
tasks, manages services, and restores or publishes verified action results.

This document describes the implementation, including its limits. Source paths
are relative to the engine workspace (`engine/` in the FluentCI repository and
the repository root in `fluentci-engine`). Workspace CLI entry points also live
in the FluentCI repository's `src/` directory.

## Execution flow

```text
 Rust / PureScript / TypeScript / Python / Gleam / Elixir / ReScript / ClojureScript
                                    |
                        Wasm module or component
                     Extism ABI / native WIT imports
                                    |
                      SDK-neutral typed host plan
             JSON ingestion is optional; it is not the native IR
                                    |
                   Validate BEFORE starting task commands
           IDs, edges, cycles, paths, policies, output conflicts
                                    |
           +------------------------+--------------------------+
           |                                                   |
     Full execution                                 Optional Git selection
           |                                     merge-base + changed paths
           |                                     declared input ownership
           |                                     downstream affected tasks
           |                                     required prerequisites
           |                                                   |
           +------------------------+--------------------------+
                                    |
                     Compile / retain selected native DAG
            interned indices + contiguous adjacency + ready frontier
                                    |
                      Scheduler: jobs + resource leases
                                    |
                 +------------------+------------------+
                 |                                     |
          Cacheable action                        Uncached action
        hash declared inputs                     service / side effect
        hash execution identity                        |
        acquire action-key lock                        |
                 |                                     |
        +--------+---------+                           |
        |                  |                           |
    Valid hit             Miss                         |
        |                  +---------------------------+
   verify blobs                              |
   stage restoration                  execute process or primitive
   publish outputs                    stream stdout / stderr
        |                             enforce timeout / cancellation
        |                                    |
        |                            re-snapshot declared inputs
        |                            verify outputs and logs
        |                            write content-addressed blobs
        |                            publish action manifest
        |                                    |
        +------------------+-----------------+
                           |
              Complete node; release dependent tasks
              Journal events, results, spans, artifacts
```

## Contracts and execution paths

`crates/executor/src/lib.rs` defines `Plan`, `Task`, and `CompiledPlan`. A plan is
ordinary typed Rust data: command arguments, dependencies, environments, working
directories, resources, service policies, cache declarations, and file or remote
operations. SDKs can serialize the same schema for interchange. Native callers
can construct and compile it directly without a JSON round trip.

Components use versioned WIT host imports and WASI Preview 2. Extism modules keep
their existing host ABI. Both reach shared native capabilities. The host package
remains `fluentci:runtime@0.1.0`; module release versions are independent.
Compiler/source inspection supplies function arguments, optionality,
documentation, and return types. Component dependencies are type-checked and
composed; Extism dependencies are bundled with module-local alias scopes.

OpenBSD uses the Wasmtime 41 runtime line to remain compatible with its Rust
1.90 toolchain; other component targets use Wasmtime 49. The OpenBSD WASI adapter
is a checked-in compatibility dependency in `vendor/wasmtime-wasi-openbsd`.
Unsupported per-socket TCP keepalive tuning returns WASI `not-supported` while
basic keepalive remains available. These target differences are also why the
platform participates in native action cache identity.

Explicit native plans use the executor described below. Legacy session calls can
also perform work directly; they do not automatically gain every native-plan
optimization merely by running in Wasm.

## Compiled graph and incremental scheduling

`crates/executor/src/graph.rs` interns task IDs into integer indices. Dependency
and successor edges use contiguous offset/node arrays rather than one allocated
vector per node. Graph construction and cycle detection take O(V + E) work and
storage for V tasks and E edges. Iterative traversal avoids stack growth on long
chains. Duplicate dependencies are normalized.

The ordinary success-dependent execution path uses an incremental frontier:
remaining-parent counts, a completed bitset, and a deterministic ready set.
Completing a task updates its successors rather than rescanning the entire plan
for readiness. Each dependency edge is released once; ready-set operations have
an additional logarithmic cost. `CompiledPlan` retains validated graph data for
repeated native executions.

Cached tasks, resource waits, and retries use that frontier too. Cache preparation
workers participate in job accounting and incremental completion. Only admitted
tasks waiting for a resource, action lock, or retry are reconsidered through a
separate deferred set; dependency-blocked tasks remain in the graph. Deferred
wait deadlines are checked even when every job slot is occupied. This does not
make repeated waiter checks linear over the entire run: resource contention and
retry policy still incur their own costs.

Services, finalizers, and non-success conditions have additional lifecycle rules.
The executor retains a general scheduling path for these policies. Consequently,
the incremental-frontier claim does not describe every workflow configuration.

The scheduler bounds concurrent work and coordinates named shared/exclusive
resources, including leases across processes. Cache preparation, publication,
and file work use owned workers and wake notifications. A busy action lock can
be retried without occupying a job slot. Successful workers publish results
before notifying the scheduler; cancellation joins owned work before releasing
its leases.

## Content-addressed action caching

`crates/executor/src/cache.rs` separates two things:

- **Action records** map an execution key to a manifest of outputs and log blobs.
- **The content-addressed blob store** stores bytes under their SHA-256 digests,
  allowing identical output content to share storage.

The action identity includes the command and arguments, declared input inventory
and file content, file modes, effective explicit environment, executable identity,
toolchain identity/files, output declarations, dependency action keys, platform,
working-directory policy, and cache-format version. Native file/digest operations
contribute their own operation identity. Structured hashes use binary MessagePack,
not an intermediate JSON plan. Environment values are not printed in cache-key
component diagnostics.

A dependency without a reusable action key contributes a run-specific identity.
Consumers therefore do not silently reuse an old cached result after an opaque
uncached prerequisite runs.

Cacheable tasks must disable ambient environment inheritance and declare the
inputs and outputs they consume or produce. Services and remote side effects
cannot be action cached. Cacheability is an explicit developer contract; the
engine does not automatically discover arbitrary file reads or network inputs.

## Inputs, outputs, and publication

Input snapshots include relative paths, content hashes, directory entries, and
permissions. Overlapping declared input roots are inventoried once per snapshot.
Workspace snapshot hashing supports bounded parallel workers with stable result
ordering. Snapshots are re-read when required for correctness; an old timestamp
alone is not accepted as proof of unchanged content.

Declared outputs are cleaned before a cacheable command runs. Input mutations
during execution prevent publishing a result under the old action key. Output
and log blobs are verified before restoration, staged, and published with
rollback of replacements if publication fails. Corrupt records are misses or
explicit failures, not trusted hits. Per-action locks coordinate equivalent
actions across CLI processes.

Before execution, the engine rejects unordered overlapping writers/readers,
unsafe cache paths, storage overlaps, and unsupported links or special files.
Dependency ordering, rather than a resource lock alone, defines which version of
a shared output a reader consumes.

Run-local workspaces copy declared sources into private writable directories.
Supported native copy-on-write operations are preferred; ordinary streaming copy
is the fallback. Writable sources are not hard-linked to the original checkout.
This provides filesystem separation, not a security sandbox for host commands.

## Git-aware affected selection

`crates/executor/src/affected.rs` is an opt-in selection layer before execution.
It resolves base/head commits, compares their merge base with head, and can add
staged, unstaged, and non-ignored untracked paths. NUL-delimited Git output
preserves filenames containing whitespace and newlines. Rename detection is
disabled so both the removed and added paths participate in ownership matching.
Missing revisions or merge bases fail explicitly, including shallow-clone cases.

The selector indexes declared cache inputs, environment files, and toolchain
files by repository-relative path. Changed paths match owning roots and roots
inside changed directories/submodules. A downstream traversal selects consumers;
a separate upstream traversal retains prerequisites. Adding an unchanged
prerequisite does not incorrectly select all of its other consumers. Both
traversals use the compiled adjacency data, with no recursion or all-pairs
task/file comparison.

Tasks without input declarations and tasks consuming external inputs are selected
conservatively. Global inputs can invalidate selection for the entire plan.
The plan file itself is a global input for CLI execution. A binary plan identity
prevents applying a previously computed selection to changed plan data.

Git selection is not a cache hit decision. Selected tasks still undergo the
normal content-based cache checks. Git does not reveal ignored-file changes,
external environment changes, network state, or every toolchain change. Declare
configuration/lockfiles as global inputs and use full execution when the Git
comparison is not a sufficient selection boundary. This is task-level selection;
automatic npm/Cargo project dependency inference is not implemented.

## Dry runs and diagnostics

```sh
fluentci execute plan.json --dry-run
fluentci execute plan.json --affected --base origin/main --dry-run
fluentci execute plan.json --affected --base origin/main \
  --global-input Cargo.lock --run-dir .fluentci/runs/checks
```

The engine CLI exposes the same options through `fluentci-engine execute`.
Dry runs validate and report selected/omitted task IDs and selection reasons.
They do not execute tasks, materialize workspaces, restore cached outputs, or
create run journals. They do not claim verified cache hits. They may read source
configuration and execute read-only Git commands.

This is not a general `fluentci run --dry-run`: arbitrary existing module code
can execute effects directly. Safe whole-module preview requires an explicit
planning contract rather than executing a module and hoping it has no effects.

Normal execution emits incremental events and a final run result. Cache component
digests explain invalidations; `cache-diff` compares saved results. Journals
support live watching and replay. OpenTelemetry reports task/service lifecycle
information. Debug JSON and final reports are intentional interfaces, not the
native scheduling representation.

## Relationship to Turborepo, Nx, and Bazel

The design follows established build-system ideas:

| Reference                                                                | Principle used in FluentCI                                                                                  | Current difference or boundary                                                                                               |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Turborepo](https://turborepo.dev/docs/crafting-your-repository/caching) | Hash complete task identities; cache outputs and logs; preserve task dependencies                           | FluentCI runs SDK-defined CI workflows and native primitives rather than primarily package scripts                           |
| [Nx](https://nx.dev/docs/reference/inputs)                               | Explicit inputs and Git-aware affected selection with downstream propagation                                | No automatic language project graph inference, filesystem tracing, or Nx-style named/glob inputs yet                         |
| [Bazel](https://bazel.build/versions/7.1.0/remote/caching)               | Separate action records from content-addressed output blobs; treat cache identity as a correctness contract | The current action cache is local; no Bazel remote-cache protocol, remote execution, or hermetic host sandbox is implemented |

FluentCI combines those ideas with portable Wasm SDKs, typed component interfaces,
CI conditions and finalizers, managed background services, and host/environment
providers. These features do not establish a performance advantage over those
systems. There is no measured cross-tool comparison at present.

## What reduces work, and what has been measured

- Affected selection avoids executing unrelated task subgraphs.
- Verified cache hits avoid starting commands and restore declared outputs/logs.
- Compiled adjacency and incremental admission reduce scheduler bookkeeping.
- Retained compiled plans avoid repeated graph construction in native callers.
- Content-addressed blobs avoid storing identical payloads repeatedly.
- Bounded hashing/copy workers and COW workspace copies reduce selected I/O costs.
- Native file and digest operations avoid shell startup for those primitives.

These mechanisms can help different workloads; their gains are not additive
constants. Process startup, compilers, disk I/O, log volume, and cache population
can dominate wall-clock time.

The recorded 2026-11-05 release benchmark on an Apple arm64 machine measured
100,000-node graph construction improvements of roughly 1.56x to 2.69x against
the older executor. The same report did **not** demonstrate a material speedup
for its 64/256-command execution workloads. See
`crates/executor/benchmarks/README.md` and its raw JSON results for the baseline,
samples, toolchain, exclusions, and reproduction instructions. Those historical
measurements do not measure the new affected selector or compare against Nx,
Turborepo, or Bazel.

Future work includes remote cache transport and trust policy, dependency/project
inference, richer input sets, and an explicit whole-module planning API. Each
requires correctness tests and representative measurements before making stronger
performance claims.
