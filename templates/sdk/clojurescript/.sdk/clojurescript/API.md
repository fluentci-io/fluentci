# Canonical PDK coverage

Generated from `schema/host.json`. Every import has a public, statically declared
`fluentci.pdk` function and a schema-driven ABI contract test. All functions are
effects. They directly mutate the legacy graph; use `fluentci.plugin` builders
or `fluentci.host` plans for reusable composition.

| Host import | ClojureScript function | Input type | Output type |
| --- | --- | --- | --- |
| `add_secretmanager` | `add-secretmanager!` | `Provider` | `t/Str` |
| `as_service` | `as-service!` | `t/Str` | `Service` |
| `branch` | `branch!` | `t/Str` | `nil` |
| `cache` | `cache!` | `t/Str` | `Cache` |
| `call` | `call!` | `Module` | `t/Str` |
| `chmod` | `chmod!` | `Chmod` | `File` |
| `commit` | `commit!` | `—` | `t/Str` |
| `devbox` | `devbox!` | `—` | `Devbox` |
| `devenv` | `devenv!` | `—` | `Devenv` |
| `directory` | `directory!` | `t/Str` | `Directory` |
| `entries` | `entries!` | `t/Str` | `(t/Vec t/Str)` |
| `envhub` | `envhub!` | `—` | `Envhub` |
| `execute_plan` | `execute-plan!` | `t/Str` | `t/Str` |
| `file` | `file!` | `t/Str` | `File` |
| `flox` | `flox!` | `—` | `Flox` |
| `get_arch` | `get-arch!` | `—` | `t/Str` |
| `get_env` | `get-env!` | `t/Str` | `t/Str` |
| `get_os` | `get-os!` | `—` | `t/Str` |
| `get_secret` | `get-secret!` | `(t/Vec t/Str)` | `(t/Vec Secret)` |
| `get_secret_plaintext` | `get-secret-plaintext!` | `(t/Vec t/Str)` | `t/Str` |
| `git` | `git!` | `t/Str` | `Git` |
| `has_env` | `has-env!` | `t/Str` | `t/Bool` |
| `hermit` | `hermit!` | `—` | `Hermit` |
| `http` | `http!` | `t/Str` | `File` |
| `install` | `install!` | `—` | `nil` |
| `md5` | `md5!` | `t/Str` | `t/Str` |
| `mise` | `mise!` | `—` | `Mise` |
| `nix` | `nix!` | `NixArgs` | `Nix` |
| `pipeline` | `pipeline!` | `t/Str` | `Pipeline` |
| `pixi` | `pixi!` | `—` | `Pixi` |
| `pkgx` | `pkgx!` | `—` | `Pkgx` |
| `proto` | `proto!` | `—` | `Proto` |
| `remove_env` | `remove-env!` | `t/Str` | `nil` |
| `set_envs` | `set-envs!` | `(t/Vec (t/HVec [t/Str t/Str]))` | `nil` |
| `set_runner` | `set-runner!` | `t/Str` | `nil` |
| `set_secret` | `set-secret!` | `(t/Vec t/Str)` | `t/Str` |
| `sha256` | `sha256!` | `t/Str` | `t/Str` |
| `stderr` | `stderr!` | `—` | `t/Str` |
| `stdout` | `stdout!` | `—` | `t/Str` |
| `tar_czvf` | `tar-czvf!` | `t/Str` | `File` |
| `tar_xzvf` | `tar-xzvf!` | `t/Str` | `Directory` |
| `tree` | `tree!` | `—` | `Directory` |
| `trust` | `trust!` | `—` | `nil` |
| `unzip` | `unzip!` | `t/Str` | `Directory` |
| `wait_on` | `wait-on!` | `(t/Vec t/Int)` | `nil` |
| `with_cache` | `with-cache!` | `Cache` | `nil` |
| `with_exec` | `with-exec!` | `(t/Vec t/Str)` | `nil` |
| `with_file` | `with-file!` | `File` | `nil` |
| `with_packages` | `with-packages!` | `(t/Vec t/Str)` | `nil` |
| `with_secret_variable` | `with-secret-variable!` | `(t/Vec t/Str)` | `nil` |
| `with_service` | `with-service!` | `t/Str` | `nil` |
| `with_workdir` | `with-workdir!` | `t/Str` | `nil` |
| `zip` | `zip!` | `t/Str` | `File` |

Object keys match the canonical wire schema (keywords, including `:Aws`).
`set-envs!` takes a vector of `[name value]` pairs; `execute-plan!` takes
the protocol JSON string. Prefer `fluentci.host/run!` for a typed plan/result.
Unsigned range checks, JSON response validation and void/pointer ABI behavior
are enforced at the guest boundary.
