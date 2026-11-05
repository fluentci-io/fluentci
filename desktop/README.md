# FluentCI Studio desktop

A Tauri 2 app for macOS and Linux, using the same React UI, Rust pipeline engine,
and SQLite history as `fluentci studio`. SeaQuery builds the database statements;
SQLx executes them and applies migrations. The app icon is generated from the
existing [favicon](../webui/public/favicon.svg).

The desktop app binds its API to `127.0.0.1` on an OS-assigned port. It never
claims Studio's default port 6076, connects to an existing server, or terminates
another Studio process. The frontend, GraphQL API, and WebSocket stream share
the desktop server's origin, so no CORS overrides or fixed Vite proxy are needed.
Desktop mode ignores `VITE_APP_API_URL` and `VITE_APP_WS_URL` overrides, keeping
its requests on its own origin even if the web build uses a custom server.
By default both apps share `~/.fluentci/fluentci.db`; `FLUENTCI_DATABASE` can select
a separate database. Desktop-initiated pipelines are cancelled on quit; runs
started by a separate CLI/Studio process are left running.

## Run

Install Rust 1.96+ and Bun, plus the native [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for your platform (Xcode command-line tools on macOS; WebKitGTK 4.1 and the build
packages listed by Tauri for your Linux distribution).

```sh
cd desktop
bun install --frozen-lockfile --ignore-scripts
bun run dev
```

`dev` builds Studio's production assets and runs Tauri in **release mode** with
the committed Cargo lockfile. It does not start Vite or use port 6076. Rust changes
restart the app; rebuild the UI assets and restart after editing React code.

Use **File → Open Project…**, **⌘O / Ctrl+O**, or **Add project → Open project
folder** to choose a project directory. Studio discovers the workspace root and
initial pipeline actions. Existing projects and saved history appear automatically.
No separate FluentCI CLI installation is needed: the desktop binary includes the
engine and handles its internal worker subcommands before opening the GUI.
External SDKs and build tools used by your pipelines must still be installed.

The app includes native Edit/Window menus, opens external HTTP(S) links in your
browser, and uses macOS’s native window border and traffic-light controls with
an overlay title bar, matching bsdkrun Desktop. The header reserves space for the
controls and supports dragging and double-clicking to zoom. Only those two window
commands are exposed to the main webview at its exact loopback origin; project
picking and all other native actions stay in Rust. Common tool
locations (`~/.local/bin`, `~/.cargo/bin`, `~/.bun/bin`, `~/.deno/bin`, Homebrew)
are added to the inherited PATH at startup for launches from a dock or Finder.

## Build bundles

```sh
bun run build
# macOS app bundle only:
bun run build --bundles app
```

JavaScript dependencies use the monorepo root `bun.lock`; installing from this
directory resolves the shared Bun workspace. `bun run build:desktop` from the
repository root runs the native build through Turborepo.

The wrapper always passes `--locked` to Cargo; Tauri builds in release mode.
Packages are written under `src-tauri/target/release/bundle/`.
For distributable macOS releases, configure Apple's signing and notarization
credentials with Tauri. Linux bundles must be built on Linux.

Regenerate the desktop icons from the favicon with `bun run icons`. The Tauri
icon generator also produces mobile assets; only desktop icon files are used.

## Validate

```sh
cd ../webui
bun install --frozen-lockfile --ignore-scripts
bun run build:web
cd ../desktop
cargo test --release --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --release --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Native backend tests cover separate API ports, shared history, independent
shutdown, workspace registration, and headless Wasm worker execution. The browser
and React tests under `webui` continue to cover the shared UI.

## Automated releases

The [Studio desktop workflow](../.github/workflows/desktop-release.yml) builds
Apple Silicon and Intel macOS installers when a GitHub release is published.
It can also be run manually from any branch: leave its optional tag empty to
create workflow artifacts, or supply an existing release tag to upload there.
Manual runs always build the selected branch at its triggering commit; the tag
input only selects the upload destination. Published releases build their tag.
The PureScript `desktop` module applies and verifies an ad hoc signature before
creating a DMG, app ZIP, and SHA-256 checksums. These builds are not notarized.
See the [CI module guide](../.fluentci/README.md#desktop-releases) for local commands.
