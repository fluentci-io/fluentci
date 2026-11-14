# CI helpers on BEAM

These Gleam modules replace the Python and shell helpers in this directory.
They target Erlang/OTP; no JavaScript target or Node.js runtime is used. The small
`ci_native.erl` FFI binds OTP filesystem, process, archive and crypto primitives.
Validation, environment handoff, registry checks and release policy live in Gleam.

GitHub jobs run `.github/actions/setup-ci-scripts`, which installs Erlang and
Gleam through the published `setup-erlang` and `setup-gleam` components, then
exports a single executable escript. Helpers use Gleam 1.17 and OTP 27 so the
bytecode also runs on BSD guests with older native toolchains; application SDK
jobs may select newer compiler/runtime versions afterward. Release jobs copy that escript into BSD
VMs so a guest does not need to compile helper sources with its native compiler.
Guest preparation first installs Bash and curl using the native package manager.
Bash must be available before FluentCI can execute either setup module. It then
calls both setup modules before running any helper.

For a BSD-only release recovery, dispatch the Release workflow from `main` with
`tag` set to the existing release, `source-ref` set to the corrected commit, and
`bsd-only` enabled. This rebuilds shared inputs and BSD assets while skipping
Linux and macOS builds; it does not move the release tag.

Noninteractive commands inside the VM run with stdin closed. The SSH runner
feeds its shell script through stdin, which an Erlang VM can otherwise consume
before the next command executes. Each guest verifies its release artifacts
before copyback; the runner verifies them again before uploading.

```sh
(cd .github/scripts && gleam export escript)
escript .github/scripts/fluentci_ci export-setup-env
escript .github/scripts/fluentci_ci check-openbsd-msrv
escript .github/scripts/fluentci_ci create-bsd-smoke-fixtures .release-smoke
escript .github/scripts/fluentci_ci verify-musl-binary target/x86_64-unknown-linux-musl/release/fluentci x86_64-unknown-linux-musl
escript .github/scripts/fluentci_ci verify-bsd-release dist/bsd/x86_64-unknown-netbsd v0.17.4 x86_64-unknown-netbsd
```

Other commands: `registry-artifact NAME@VERSION`, `prepare-bsd-release`,
`build-bsd-release`, `smoke-bsd-release BINARY FIXTURES`, `bsd-rust-cache`, and
`export-spindle-env`. The BSD build reads `TARGET`, `RELEASE_VERSION` and
`BSD_RUST_VERSION`; credentials remain inherited environment variables.

The environment bridge reads a final typed setup record from stdin and streams
preceding diagnostics to stderr. It validates every variable before writes,
rejects reserved names and duplicate fields, preserves PATH priority, and uses
unique delimiters for multiline values. Spindle uses the same validation and
writes its private environment manifest atomically.

```sh
gleam format --check .github/scripts
escript .github/scripts/fluentci_ci test
```

Tests generate data fixtures; they do not launch FluentCI, install tools or boot
VMs. Real BSD and Alpine smoke tests remain in the release workflow. All runtime
verification runs in CI.
