---
title: "Desktop app"
description: "Use FluentCI Studio in a native Tauri window with an independent local API instance."
section: "Studio and publishing"
url: "/studio/desktop/"
source: "studio/desktop.md"
---

## Install and open

Download the desktop package from the project's releases. Current desktop release
automation builds macOS aarch64 and x86_64 packages and performs ad-hoc signing
before creating installers and checksums. Ad-hoc signing is not Apple
notarization; follow the release's installation instructions for the platform.

The app presents Studio in a native window. macOS uses native window borders and
controls. Host command dependencies still need to be available to the desktop
process; an interactive shell's configuration is not automatically identical to
the GUI application's environment.

## Independent API listener

The desktop app starts its own loopback API on an OS-assigned port. It does not
claim the CLI Studio's default port 6076, so the two can run simultaneously.
Do not hard-code 6076 when integrating with the desktop frontend.

Database selection and local state still determine which projects are visible.
The remembered account file contains identity only. Publishing needs the account
and app-password environment variables in the CLI process performing it.

## Develop the desktop app

From the repository root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run build:desktop
```

For native development details, see `desktop/package.json`,
`desktop/src-tauri/`, and the [development guide](/development/). Studio assets
must be built before compiling the native executable.

The release workflow can also be triggered manually. Desktop release jobs call
the repository's PureScript FluentCI module, which drives builds for the selected
target, signs and verifies bundles, and creates release artifacts.
