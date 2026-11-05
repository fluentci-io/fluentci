---
title: "Python"
description: "Export guest jobs with decorators and compose host commands through the Python SDK."
section: "Language SDKs"
url: "/sdks/python/"
source: "sdks/python.md"
---

## Create a module

```sh
fluentci init --sdk python
# Or add to an existing workspace:
fluentci modules add ci --sdk python
```

The SDK starter creates its own source and build configuration. The following
sample belongs in `plugin.py`. It prints a greeting, then inspects the current Git
workspace; run it from a Git repository.

## Pipeline example

```python
import extism
from fluentci import pipeline


@extism.plugin_fn
def hello() -> None:
    output = (
        pipeline("hello")
        .exec("echo", "Hello from FluentCI")
        .exec("git", "status", "--short")
        .stdout()
    )
    extism.output_str(output)
```

Chain .exec() calls; .stdout() runs the pipeline and returns its output.

## Toolchain and build

Install uv and the Extism Python/Binaryen tools required by the SDK (`extism-py`,
`wasm-merge`, and `wasm-opt`). The starter's `pyproject.toml` points at a local
`.sdk/python` package and requires Python 3.11 or newer.

The default CLI build synchronizes dependencies and invokes the `fluentci-plugin`
compiler for the selected entry, producing `dist/plugin.wasm`. A registered
existing module can specify an `entry`; the default is `plugin.py`.

## Entry and execution

The small generated starter uses `@extism.plugin_fn` to export `hello` and writes
a greeting with `extism.output_str`. The pipeline example above expands that job
with host commands. Builder chaining describes the pipeline; `stdout()` performs
execution and returns output.

The guest environment is not a general host CPython installation. Use SDK host
operations for supported filesystem/process capabilities rather than assuming
arbitrary native extensions and host Python packages are embedded in Wasm.

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
