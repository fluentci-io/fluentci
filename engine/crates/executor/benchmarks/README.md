# Executor library comparison

This harness measures the old and current Rust executor libraries in one release
binary. It never builds or launches the FluentCI CLI. Command workloads launch
`/usr/bin/true` (or `/bin/true`) directly through the executor.

From the engine checkout:

```sh
python3 crates/executor/benchmarks/compare.py \
  --baseline 18aa235051b0cc5649ae03c0d3deaf4043e4f11f \
  --samples 7 --output /tmp/executor-comparison.json
```

From FluentCI's checkout, use
`python3 engine/crates/executor/benchmarks/compare.py` with the same options.
The script finds the baseline in `../fluentci-engine`; override that with
`--baseline-repo /path/to/fluentci-engine`.

The script extracts the baseline executor source from Git into an isolated
workspace, renames its crate to allow both versions in the same executable, and
preserves the engine lockfile's dependency versions. It needs those dependencies
in Cargo's local cache. It runs release Clippy with warnings denied and builds
with `cargo build --release --locked` before measuring. Temporary source, binaries,
and run directories are removed after completion.

Measurements include:

- Graph construction: 100,000-node chains, independent nodes, a large join, and
  layers of 16 nodes. Each node in a layer depends on every node in the prior
  layer. Input creation and graph destruction are excluded.
- Actual execution: a 64-command chain and 256-command independent/layered graphs,
  with 16 job slots. Another independent graph publishes a named text output for
  each command. Execution includes validation, process management, logging,
  publication, journal writes, and final report writing.
- Reuse: the current executor is also timed with a `CompiledPlan` prepared before
  measurement. Its compilation cost is excluded from that column.

Each scenario has one warmup round. Measurement order alternates to reduce order
bias. Every run has a fresh log directory; output publication is checked for every
task. Input creation, JSON decoding into typed plans, build time, result checking,
and cleanup are outside execution timings. Both versions use the same runtime,
inputs, job limit, working directory, and filesystem. OS caches are not flushed.

The JSON report records all samples, medians, ranges, host/toolchain information,
the baseline commit, current checkout state, source fingerprint, binary hash,
and generated lockfile hash. Timing thresholds are deliberately absent: host
load, filesystem behavior, and process startup can dominate. A microbenchmark
speedup is not an application-wide speedup.

Adjacency layout bytes describe the graph's logical arrays and per-node vector
headers. They exclude allocator slack, top-level headers, IDs, temporary storage,
and other plan/runtime state. They are not peak RSS measurements.

## Recorded comparison (2026-11-05)

Measured on macOS 15.6, Apple arm64, 10 logical CPUs, Rust 1.99.1. Seven samples
after one warmup; the baseline is `18aa235` (before compiled graph execution).
The current source and binary hashes are recorded in
[the raw report](results/2026-11-05-macos-arm64.json).

| Graph construction, 100,000 nodes | Before median | After median | Ratio |
| --- | ---: | ---: | ---: |
| chain | 10.37 ms | 4.79 ms | 2.17× |
| wide | 4.24 ms | 2.72 ms | 1.56× |
| join | 12.10 ms | 4.50 ms | 2.69× |
| layers | 58.08 ms | 25.81 ms | 2.25× |

| Command execution | Before median | After median | Reused compiled plan |
| --- | ---: | ---: | ---: |
| chain, 64 tasks | 842.92 ms | 840.17 ms | 835.57 ms |
| wide, 256 tasks | 305.16 ms | 303.87 ms | 304.39 ms |
| layers, 256 tasks | 307.59 ms | 307.18 ms | 308.63 ms |
| wide, 256 tasks with outputs | 324.98 ms | 318.79 ms | 312.79 ms |

Graph construction improved in these cases. Command execution did not show a
material speedup at these sizes; the small differences are within the sample
variation. These results do not establish a general end-to-end speedup or prove
which runtime component is dominant. Profile process waiting, logging, and
publication separately before changing those paths.
