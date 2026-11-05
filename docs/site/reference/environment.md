---
title: "Environment variables"
description: "Separate CLI identity, local state, engine cache settings, and registry server configuration."
section: "Reference"
url: "/reference/environment/"
source: "reference/environment.md"
---

## CLI and local application state

| Variable                 | Purpose / default                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `FLUENTCI_DATABASE`      | SQLite path; defaults to `~/.fluentci/fluentci.db`; `--database` selects explicitly |
| `FLUENTCI_NO_OPEN`       | Set to suppress Studio's automatic browser opening                                  |
| `RUST_LOG`               | Rust diagnostic logging filter                                                      |
| `FLUENTCI_PROJECT_ID`    | Associate supported local execution with a saved project                            |
| `FLUENTCI_PACKAGE_CACHE` | Override verified registry Wasm download cache directory                            |

Workspace `.fluentci/.env` values are separate from application command-line
options. `fluentci env` prints those values; avoid sharing its output blindly.

## AT Protocol publishing account

| Variable                | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `FLUENTCI_ACCOUNT`      | Handle or DID used for authentication                                    |
| `FLUENTCI_APP_PASSWORD` | Account app password, required with account for authenticated operations |
| `FLUENTCI_PDS_URL`      | Optional explicit PDS endpoint; HTTPS or loopback HTTP                   |
| `FLUENTCI_ACCOUNT_FILE` | Override `~/.fluentci/account.json` identity file                        |
| `FLUENTCI_TANGLED_SYNC` | Set `false` to disable background public repository sync                 |
| `FLUENTCI_REGISTRY_URL` | Registry API origin; default `https://api.fluentci.io`                   |
| `FLUENTCI_REGISTRY_DID` | Upload token audience; default `did:web:api.fluentci.io`                 |

Only identity is remembered on disk; app passwords and session tokens are not.
The registry service audience and the publishing user's DID are different roles.
See [authentication](/registry/authentication/).

## Installer

| Variable               | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `FLUENTCI_VERSION`     | Install a specific release instead of resolving latest |
| `FLUENTCI_INSTALL_DIR` | Override the installer destination                     |

When piping curl to `sh`, set these on the receiving `sh` process.

## Engine cache and telemetry

Cache variables include `FLUENTCI_CACHE_GCS_BUCKET`,
`FLUENTCI_CACHE_S3_ENDPOINT`, `FLUENTCI_CACHE_S3_BUCKET`, and
`FLUENTCI_CACHE_CDN_ENDPOINT`. Authentication comes from the provider's credential
configuration, such as `GOOGLE_APPLICATION_CREDENTIALS` or AWS credentials.

Telemetry variables include `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_EXPORTER_ZIPKIN_ENDPOINT`,
`OTEL_EXPORTER_JAEGER_AGENT_HOST`, and `BASELIME_API_KEY`.

## Registry server

The Gleam API at `apps/api` loads its own `.env` and validates it before opening
SQLite or networking. Its variables include `HOST`, `PORT`, `DATABASE_URL`,
`SERVICE_DID`, `JETSTREAM_URLS`, `JETSTREAM_ENABLED`, and S3 settings. They are not
CLI package configuration. The full table is in
[registry deployment](/development/registry/).

Keep app passwords, storage keys, and telemetry credentials in process or service
secret configuration. Placeholder values shown in examples are not valid secrets.
