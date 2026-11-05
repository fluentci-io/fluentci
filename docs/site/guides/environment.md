---
title: "Environment and providers"
description: "Keep pipeline configuration, compiler tools, and provisioned host environments understandable."
section: "Build pipelines"
url: "/guides/environment/"
source: "guides/environment.md"
---

## Workspace environment

Create `.fluentci/.env` for local values and keep secrets out of source control:

```sh
BUILD_MODE=development
```

`fluentci env` displays workspace environment values, so treat its output as
potentially sensitive. Prefer a secret store or runner secret configuration for
credentials that should not be printed.

## Step and plugin environment

TOML steps accept string assignments:

```toml
[[steps]]
name = "build"
command = "cargo build --release --locked"
env = ["BUILD_MODE=release"]
```

SDKs expose their own environment functions. In ClojureScript, a pure pipeline
transformation can be composed before execution:

```clojurescript
#?(:clj (t/ann release [p/Pipeline -> p/Pipeline]))
(defn release [pipeline]
  (p/env pipeline "BUILD_MODE" "release"))
```

Here `p` is `fluentci.plugin` and the checked `.cljc` namespace includes Typed
Clojure as `t`, as shown in the [SDK guide](/sdks/clojurescript/).

## Providers

The embedded engine supports environments such as Nix, Flox, Devbox, Devenv,
EnvHub, Hermit, Mise, Pixi, Pkgx, and Proto. Provider executables and their own
configuration must be available. A provider configures the host environment;
it does not change the language used to compile a plugin.

Select providers using the SDK's documented builder APIs. Provider coverage,
argument order, and error handling depend on the SDK. Consult the
[engine SDK documentation](https://github.com/fluentci-io/fluentci-engine/tree/main/sdk)
for the provider-specific contracts instead of assuming every SDK function is
identical.

## Check tools before running

Use `fluentci doctor` for external dependencies. Source module builds additionally
check SDK-specific tools and fail before launching partial builds. Project-local
compiler executables can come from `node_modules/.bin` or the Python virtual
environment where supported.

Authentication variables are documented separately in
[account authentication](/registry/authentication/); registry server storage
configuration belongs to [registry deployment](/development/registry/).
