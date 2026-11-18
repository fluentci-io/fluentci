# FluentCI Cache

PureScript native Wasm component for FluentCI cache setup, watched Nix builds,
and streaming generic HTTP cache save/restore. Requires FluentCI 0.17.8+ and
Node.js 24+. The component embeds its compiled host helper; consumers need only
`plugin.wasm`, without this checkout, node_modules, or sibling files.

## Building and publishing

`npm run build` installs this module's dependencies from `package-lock.json`
with `npm ci --include=dev` before packaging. FluentCI publishing invokes this
same build, so `esbuild`, `tar` and the module's other build dependencies do not
need a separate manual installation. The development dependencies are needed
even when `NODE_ENV=production` is set.

## Required credentials

Set `FLUENTCI_CACHE_TOKEN` through your CI secret provider. It is required for
**every operation**, environment-only, and never included in returned records or
generated configuration. Provide `--url` or `FLUENTCI_CACHE_URL`; the argument
wins. There is no implicit account or URL. DID, handle with or without `@`, and
legacy `/accounts/<hash>` URLs are accepted. Omit protocol suffixes such as `/nix`.

```sh
export FLUENTCI_CACHE_URL=https://cache.fluentci.io/@example.com
# Configure FLUENTCI_CACHE_TOKEN through your secret provider.
fluentci run cache setup --protocol sccache
fluentci run cache save --key dependencies/linux --path node_modules --compression zstd
fluentci run cache restore --key dependencies/linux --path node_modules
```

## Generic HTTP cache

`save` accepts a file or directory. Compression choices are `zstd` (default,
level 3), `gzip`, and `none`. Directories are tar archives. `restore` detects the
recorded compression automatically, validates the payload checksum, rejects
unsafe archive paths, escaping links and special entries, then stages replacement on
the destination filesystem. A download or extraction failure preserves the
existing destination. Unsupported formats fail explicitly. Archives use this
module's versioned envelope; raw files uploaded by other clients are not silently
interpreted as archives. The current expanded-size limit is 20 GiB.

A missing key returns `hit=false`; `--required` makes a miss fail. Authentication,
backend errors and corrupt archives always fail. Uploads and transient downloads
retry at most three times. No shell expansion is performed on keys or paths.

## Protocol setup

| Protocol | Setup result |
| --- | --- |
| `nix` | Publishes NIX_CONFIG with FluentCI substitution and trust settings |
| `sccache` | Installs pinned checksum-verified sccache on Linux/macOS x64 and ARM64 (plus Windows assets when supported by the FluentCI host); activates WebDAV and disables directory creation |
| `bazel` | Generates bazelrc and environment-backed credential helper |
| `bazel-grpc` | Generates gRPC endpoint, canonical account instance and credential helper |
| `turbo` | Publishes API URL, owner team and token binding |
| `nx` | Publishes self-hosted endpoint and token binding |
| `buildkit` | Generates Docker login/build wrapper and account-scoped registry reference |
| `go` | Publishes GOCACHEPROG; install the fluentci-cache helper and Go 1.24+ first |
| `gradle` | Generates an init script; invoke Gradle using the generated instructions |
| `maven` | Generates extension, cache configuration and settings fragments to merge |
| `generic` | Configures generic HTTP cache access for save/restore |

Setup writes a **fresh** `.fluentci/cache/PROTOCOL` directory by default; use
`--config-dir` to choose another directory. Existing directories are rejected.
It returns generated paths and public environment values, activates credentials
in the FluentCI engine, and creates `env.sh` for external shell workflows. For
separate GitHub Actions steps, supply the relevant token variable from the same
secret; secret values are deliberately absent from the setup result.

On systems without a supported sccache binary (including BSD), setup selects
`FLUENTCI_RUST_CACHE_BACKEND=generic`. Restore/save the Cargo target directory
around the build using `cache restore` and `cache save`. Use keys including OS,
architecture, Rust version, target and Cargo.lock hash. The manual FluentCI cache build workflow uses this fallback for BSD artifacts.

Other client tools are not installed automatically. Node and Nix are declared
setup dependencies; the Go helper, Gradle, Maven, Bazel, Nx, Turbo and Docker
remain client prerequisites. BuildKit login writes Docker's normal credentials.
Public CDN reads do not need the upload token; this module intentionally requires
it to configure an authenticated cache consistently.

## Nix build

```sh
# Also configure FLUENTCI_NIX_PUBLIC_KEY and FLUENTCI_NIX_SIGNING_KEY as appropriate.
fluentci run cache nix-build --flake .#my-package
```

Requires the complete Nix public/private signing keys in the environment. It
restores exact available outputs, watches new store paths while Nix builds,
reuses upstream/FluentCI metadata, exports signed Zstd NARs, uploads payloads
before narinfo with 16 workers, retries transient errors and drains uploads
before success. No keys are generated. Temporary private key files are removed.
Nix sandboxed derivations use this binary cache rather than remote sccache.

Generic restore follows HTTPS CDN redirects and strips the upload token when
crossing origins. Public S3-backed artifact reads go directly to the CDN;
uploads continue through the authenticated cache service.

## Validation

Builds, tests and generated-file checks run in CI. No local runtime validation
was performed for this extraction. See [COMPONENT.md](./COMPONENT.md).

This is the self-contained CI copy of the [reusable module](https://github.com/fluentci-io/modules/tree/main/caching/cache).
The [manual cache build workflow](../../.github/workflows/cache-build.yml) covers
Linux, macOS, FreeBSD, NetBSD, and OpenBSD without publishing a release.
