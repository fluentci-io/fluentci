# cache component functions

Requires FluentCI v0.17.3 or newer. The compiler derives native WIT signatures
and embedded help from these typed PureScript functions. Optional arguments may be omitted.

## `setup`

Configure a FluentCI cache protocol using required environment credentials.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `protocol` | `string` | yes | Cache protocol to configure. Allowed values: nix, bazel, bazel-grpc, turbo, nx, buildkit, sccache, go, gradle, maven, generic. |
| `url` | `string` | no | HTTPS account base URL; overrides FLUENTCI_CACHE_URL. One of this argument or the environment variable is required. |
| `config-dir` | `string` | no | Fresh output directory; defaults to .fluentci/cache/PROTOCOL. Existing directories are rejected. |
| `repository` | `string` | no | BuildKit repository and tag. Default: "buildkit/default:cache". |

Returns `Native.SetupResult`.

## `nix-build`

Build a Nix installable while reusing and publishing signed FluentCI cache outputs.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | `string` | no | HTTPS account base URL; overrides FLUENTCI_CACHE_URL. One of this argument or the environment variable is required. |
| `flake` | `string` | no | Nix installable to build. Default: ".#default". |

Returns `{ outcome :: String }`.

## `save`

Compress and upload a file or directory to the generic HTTP cache.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | `string` | yes | Safe slash-separated cache key. |
| `path` | `string` | yes | File or directory to cache. |
| `url` | `string` | no | HTTPS account base URL; overrides FLUENTCI_CACHE_URL. One of this argument or the environment variable is required. |
| `compression` | `string` | no | Archive compression; restore detects it automatically. Default: "zstd". Allowed values: zstd, gzip, none. |

Returns `Native.TransferResult`.

## `restore`

Download, verify and restore a generic HTTP cache entry without replacing files on failure.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | `string` | yes | Safe slash-separated cache key. |
| `path` | `string` | yes | Destination file or directory; cannot be the current directory or filesystem root. |
| `url` | `string` | no | HTTPS account base URL; overrides FLUENTCI_CACHE_URL. One of this argument or the environment variable is required. |
| `required` | `boolean` | no | Fail if the cache key is missing; otherwise return hit=false. Default: false. |

Returns `Native.TransferResult`.
