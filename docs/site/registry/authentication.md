---
title: "Account and Tangled"
description: "Authenticate with an AT Protocol app password, remember identity, and cache public Tangled repositories."
section: "Studio and publishing"
url: "/registry/authentication/"
source: "registry/authentication.md"
---

## Set account environment variables

Local pipelines and Studio do not require authentication. Publishing uses an AT
Protocol account and app password:

```sh
export FLUENTCI_ACCOUNT='alice.example'
export FLUENTCI_APP_PASSWORD='replace-with-an-app-password'
fluentci whoami
```

`FLUENTCI_ACCOUNT` accepts a handle or DID. Use an app password issued by the
account's PDS, not a placeholder or an unrelated service token. Set credentials
in the invoking process or a runner's secret environment. The CLI has no `login`
command in this flow.

`whoami` authenticates and fetches account information. When either variable is
missing, it prints that the user is not logged in and explains the environment
variables to set.

## PDS discovery and identity

The CLI uses Jacquard to authenticate and resolve the session. Set
`FLUENTCI_PDS_URL` only when an explicit PDS endpoint is needed. HTTPS is required,
with HTTP permitted for loopback development.

Successful authentication writes account identifier, canonical DID, handle, and
PDS to `~/.fluentci/account.json`. It does not persist the app password or session
tokens. `FLUENTCI_ACCOUNT_FILE` overrides this identity-file path. The desktop app
and GraphQL API can read the remembered identity without receiving credentials.

A remembered identity is not proof of a currently valid session: `whoami` and
publishing authenticate from the current environment each time.

## Background Tangled indexing

After authentication the CLI schedules a detached worker to read the account's
public `sh.tangled.repo` records from its PDS. Valid repository metadata and clone
URLs are cached in local SQLite for consumers such as Studio. The worker does
not inherit the app password.

Successful syncs are rate-limited, leases avoid competing workers, and a failed
sync preserves the previous cache. Set `FLUENTCI_TANGLED_SYNC=false` to disable
scheduling. GraphQL exposes cached entries only for the remembered account DID.

## Registry identity

The publisher DID, not its changeable handle, identifies the author of a plugin.
Two publishers can use the same plugin name. Each publisher/name can have
multiple versions, with unique `(author DID, name, version)` records. Continue
with [publishing](/registry/publishing/).
