# Cachix for FluentCI

Configure Cachix for Nix builds and automatically upload build outputs when
`CACHIX_AUTH_TOKEN` is set. Written in PureScript and compiled to a reusable Wasm
module.

## Quick start

Run from your Nix flake workspace:

```sh
# Supply this through your shell or CI secret store.
export CACHIX_AUTH_TOKEN="<your-cachix-token>"

fluentci run cachix setup fluentci
nix build
fluentci run cachix push fluentci
```

Replace `fluentci` with your Cachix cache name. `cachix` resolves to the official
`@fluentci.io/cachix` module; use `@your-handle/cachix` when published under another
account. Add `@v1.2.3` to the module reference to pin a published version.

The host needs Nix with flakes and `nix-command` enabled. The module obtains the
Cachix CLI through `nix run --inputs-from . nixpkgs#cachix`, using your workspace's
Nix inputs; a separate Cachix installation is unnecessary.

## Exported functions

| Function | Usage                                  | Behavior                                                                  |
| -------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `setup`  | `fluentci run cachix setup CACHE_NAME` | Runs `cachix use CACHE_NAME` to configure the binary cache.               |
| `push`   | `fluentci run cachix push CACHE_NAME`  | Uploads the `./result` output closure, including an already-built result. |

Both functions accept `CACHIX_CACHE` when no cache name is passed:

```sh
export CACHIX_CACHE=fluentci
fluentci run cachix setup
nix build
fluentci run cachix push
```

A cache name must be a lowercase DNS label: 1–63 letters, digits, or hyphens,
without a leading or trailing hyphen.

`setup` configures a cache; it does **not** upload build outputs by itself. Use
`push` after a build for the final output closure, or compose `runWithCache` in
PureScript to upload new store paths as the build runs.

## Optional authentication

If `CACHIX_AUTH_TOKEN` is absent, empty, or whitespace-only, `setup` and `push`
print a skip message and succeed. `runWithCache` still executes the underlying
build normally.

When a token is present, Cachix reads it from the inherited host environment.
The module does not put the token in command arguments or print it. Cache setup,
authentication, upload, and build failures propagate to FluentCI.

## Compose in PureScript

When this module is available as a PureScript dependency, import `CI.Cachix`:

```purescript
module Main where

import Prelude
import CI.Cachix as Cachix
import Effect (Effect)

build :: Effect Unit
build = do
  Cachix.setupWith "fluentci"
  Cachix.runWithCache "fluentci" [ "nix", "build" ]
  Cachix.pushResultWith "fluentci"
```

`runWithCache` wraps the command in `cachix watch-exec CACHE_NAME -- ...` while
authenticated. It watches newly produced Nix store paths, including build-time
dependencies and intermediate artifacts. The explicit final push also covers a
warm build that creates no new store paths.

The source API exports `setupWith`, `runWithCache`, and `pushResultWith`; the Wasm
module exports the CLI functions `setup` and `push`.

## GitHub Actions

After installing Nix and FluentCI and checking out the repository:

```yaml
- name: Configure Cachix and build
  env:
    CACHIX_AUTH_TOKEN: ${{ secrets.CACHIX_AUTH_TOKEN }}
    CACHIX_CACHE: fluentci
  run: |
    fluentci run cachix setup "$CACHIX_CACHE"
    nix build
    fluentci run cachix push "$CACHIX_CACHE"
```

Without the secret, the Nix build still runs and Cachix steps skip. In this
repository, the Nix build module additionally composes `runWithCache` to upload
build-time paths through `watch-exec`.

## Source and metadata

- [Source repository](https://github.com/fluentci-io/fluentci)
- Module directory: `.fluentci/cachix`
- [Raw README](https://raw.githubusercontent.com/fluentci-io/fluentci/main/.fluentci/cachix/README.md)
- License: [MPL-2.0](./LICENSE)

Use the raw README URL as `readme_url` when publishing, or supply the source
repository and module subdirectory so consumers can find this README.
