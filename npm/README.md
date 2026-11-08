# @fluentci/cli

Run [FluentCI](https://fluentci.io) without a separate installation:

```sh
npx @fluentci/cli --help
npx @fluentci/cli run setup-node setup --version 24.22.2
```

Or install the `fluentci` command globally:

```sh
npm install -g @fluentci/cli
fluentci --help
```

Requires Node.js 20 or newer and `tar`. Supports macOS and Linux (glibc 2.39+)
on x86_64/arm64, and FreeBSD, NetBSD, and OpenBSD on x86_64. Windows and Linux
musl binaries are not currently published.

The package has no runtime npm dependencies. Installation downloads the matching
binary from [GitHub releases](https://github.com/fluentci-io/fluentci/releases)
and verifies its archive against the release's SHA-256 checksum before extraction.
The npm package version selects the matching FluentCI release; installing another
npm package version selects that release instead.

Binaries are cached per version and platform in `~/.cache/fluentci/npm` on Linux
and BSD, or `~/Library/Caches/fluentci/npm` on macOS. `XDG_CACHE_HOME` is respected.
The wrapper forwards arguments, terminal input/output, exit codes, and signals.

## Configuration

- `FLUENTCI_VERSION`: override the binary release, e.g. `v0.17.3` or `latest`.
- `FLUENTCI_CACHE_DIR`: override the binary cache directory.
- `FLUENTCI_SKIP_DOWNLOAD=1`: skip the install-time download. The first invocation
  downloads the binary if it is missing, including when npm lifecycle scripts
  were disabled with `--ignore-scripts`.

```sh
FLUENTCI_VERSION=v0.17.3 npx @fluentci/cli --version
```

Errors such as missing releases, unsupported platforms, and checksum mismatches
fail installation without executing the downloaded artifact.

## Development and publishing

This directory is a standalone npm package. Its version must match an existing
FluentCI GitHub release tag (with a `v` prefix). Release binaries and checksums
must be uploaded before publishing the npm package.

```sh
cd npm
npm test
npm publish --access public
```

Tests use local fixtures; they never install or execute the FluentCI CLI.
