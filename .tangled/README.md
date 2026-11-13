# Spindle CI

These workflows mirror the non-release Ubuntu jobs in `.github/workflows` using
`engine: microvm` and `image: almalinux10`. GitHub workflows stay in place. No release,
registry publication, desktop, macOS, or BSD release jobs are defined here.

## Runner configuration

Select a spindle under the Tangled repository's **Settings → Pipelines**. Its
operator must install the Tangled **almalinux10** microVM image, with Bash, Git,
DNF and passwordless sudo for the `spindle-workflow` user. AlmaLinux 10 is one of
Tangled's supplied image builds; the selected spindle must still provision it.
Include `zstd` in the image for cache restore/save.

Set the spindle's workflow timeout to at least **120 minutes** for Rust and Nix.
Spindle defaults to five minutes and does not accept GitHub's `timeout-minutes`
field in a workflow. Its AlmaLinux VM needs sufficient RAM and disk for Wasmtime
release builds. Native package prerequisites are installed with DNF; toolchains
come from the same pinned FluentCI registry setup modules as GitHub.

The existing `.tangled/scripts/bootstrap.sh` remains the APT bootstrap for Ubuntu.
Tangled workflows select `bootstrap-dnf.sh`, which enables CRB/EPEL and installs
the corresponding AlmaLinux development and browser packages. Both bootstraps
share `toolchains.sh` so FluentCI setup module versions stay aligned. No GitHub
Actions workflow is switched away from Ubuntu.

Browser workflows use `playwright install chromium` after the DNF bootstrap
installs shared libraries and fonts. They deliberately omit `--with-deps`, which
would attempt APT on an unsupported distribution. AlmaLinux is outside
Playwright's officially supported Debian/Ubuntu platforms; browser availability
is checked separately from workflow YAML validation.

## Coverage

| Workflows                 | GitHub equivalent                                                       |
| ------------------------- | ----------------------------------------------------------------------- |
| `ci.yml`                  | Rust checks, CI component contracts, SDK inspection, packaging fixtures |
| `docs.yml`, `landing.yml` | Workspace checks, builds, Storybook and browser tests                   |
| `modules.yml`, `api.yml`  | Download Worker and registry API checks                                 |
| `components-*.yml`        | Seven independent language component SDK jobs                           |
| `npm.yml`                 | Linux installer/wrapper tests and package dry run; no npm publishing    |
| `nix-build.yml`           | Native Linux Nix build, Cachix watch/push when authenticated            |

Jobs are separate workflow files because Spindle has no GitHub-style job matrix
or cross-workflow artifact handoff. Files and installed tools persist inside each
microVM. Nix compiles its components in that VM rather than exchanging GitHub
artifacts, and builds the AlmaLinux executor's native Linux architecture; there is
no macOS or forced ARM executor requirement. Browser diagnostics are retained as
an `always` cache entry when the spindle has a cache backend, rather than as
GitHub Actions artifacts.

CI and component workflows run on pushes to `main`, pull requests targeting
`main`, and manual runs. npm retains its path filters. Nix runs on `main` pushes
or manually, matching GitHub. Manual runs can select a workflow by filename.

## Setup environments and caches

Each command sources `.tangled/scripts/common.sh`, which restores a private,
workspace-local handoff from `.tangled-state/environment.sh`. Setup components
return typed environment records. `setup-env.py` reuses the GitHub bridge's
validation, streams installation logs immediately, merges tool variables across
steps, and shell-quotes literal values. There is no `eval` of component output.
The handoff, temporary files and credentials are gitignored and never cached.
Rust toolchains/Cargo data and release outputs have native Spindle cache entries;
Bun's download cache is reused without caching platform-specific node_modules.

Repository secrets are provided directly by Spindle. Optionally configure:

- `GH_TOKEN`: GitHub API access and authenticated Nix fetches, avoiding shared-IP
  API limits. It is read from the environment, never embedded in YAML.
- `CACHIX_AUTH_TOKEN`: enables the Nix build module's `watch-exec` upload and final
  result-closure push to the **fluentci** cache. Without it, the build still runs.

The Rust CI workflow validates the setup handoff and workflow manifests. YAML
validation uses AlmaLinux's `python3-pyyaml`; it does not boot a VM, install tools or
invoke FluentCI.

## References

- [Spindle workflow reference](https://tangled.org/docs/spindles/workflows/)
- [Writing workflows](https://tangled.org/docs/spindles/writing-workflows/)
- [Secrets](https://tangled.org/docs/spindles/secrets/)
