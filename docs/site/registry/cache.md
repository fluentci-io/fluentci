---
title: "Cache access"
description: "Generate cache upload tokens, invite collaborators, and authorize CI with revocable credentials."
section: "Studio and publishing"
url: "/registry/cache/"
source: "registry/cache.md"
---

## Generate an upload token

Open [Build cache](https://fluentci.io/cache) and sign in with your AT Protocol
account. Older sessions show **Authorize cache access**; approve the additional
cache permissions before continuing.

Choose **Generate upload token** to receive your account's cache URL and an
upload token valid for one hour. Keep the owner field empty for your own cache.
For a shared cache, enter the owner's handle or DID after they invite you.
The browser obtains a short-lived PDS service-auth JWT bound to the exact cache
API method, then exchanges it at the FluentCI API. PDS session credentials are
not sent to the FluentCI API. Upload tokens remain in page memory and disappear
on sign-out, reload, or expiry.

Configure your cache client with the returned URL and a bearer token or a
Basic-auth password. For the Go helper:

```sh
export FLUENTCI_CACHE_URL='https://cache.example/accounts/OWNER_HASH'
export FLUENTCI_CACHE_TOKEN='UPLOAD_TOKEN'
export GOCACHEPROG='fluentci-cache gocache'
go build ./...
```

Use **Renew upload token** for a new one-hour token. Renewing does not revoke a
previous token. Cached files remain publicly readable through a correctly
configured CDN; invitations and tokens control uploads.

## Invite a collaborator

In **Invite collaborators**, enter a handle or DID and choose **Invite user**.
This grants upload access to your own cache. Share your handle with the user;
they sign in and generate their own upload token with you as the cache owner.
No email or external invitation message is sent automatically.

**Revoke access** immediately prevents that user from generating more tokens.
Already-issued upload tokens remain valid until their one-hour expiry.

## Connect CI

In **CI credentials**, name and create a credential for your own cache. Copy its
secret immediately: it is shown once and cannot be recovered from the API.
The server stores only a SHA-256 hash. Save the secret as
`FLUENTCI_CACHE_CREDENTIAL` in your CI secret store, never in source control.
Credentials expire after 90 days and can be revoked in the same page. Create a
replacement and update the CI secret before revoking the old credential.

Each CI run exchanges this credential for a fresh one-hour upload token. CI does
not need an AT Protocol account password, OAuth session, or browser login.
For jobs longer than one hour, repeat the exchange immediately before uploading.
Revoking a CI credential blocks new exchanges; existing upload tokens expire
normally. A CI credential only authorizes the token exchange endpoint, with no
permission to manage collaborators, other credentials, or cache administration.

From a checkout of this repository, use the Node.js 22+ helper:

```yaml
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Get cache upload token
        env:
          FLUENTCI_CACHE_CREDENTIAL: ${{ secrets.FLUENTCI_CACHE_CREDENTIAL }}
        run: node scripts/cache-token.mjs --github-env
      - name: Build
        run: |
          # FLUENTCI_CACHE_URL and FLUENTCI_CACHE_TOKEN are available here.
          # Configure your cache client, then run your build.
          go build ./...
```

The helper masks the upload token and writes the variables to `GITHUB_ENV`. It
requires no GitHub OIDC permissions. The Go example also needs Go and the
`fluentci-cache` helper installed and `GOCACHEPROG` set as shown above. For other
repositories, vendor the helper or use the HTTP exchange directly. For other CI
providers, write a private environment file:

```sh
node scripts/cache-token.mjs --env-file .cache-upload.env
set -a
. ./.cache-upload.env
set +a
# Run the cache client, then delete the environment file when done.
```

Keep that file out of source control and build artifacts. The helper writes it
with owner-only permissions and does not print its contents.

## API methods

All methods are JSON POST requests under
`https://api.fluentci.io/xrpc/io.fluentci.cache.`.

| Method               | Authentication                       | Input                                   |
| -------------------- | ------------------------------------ | --------------------------------------- |
| `createToken`        | Method-bound PDS service JWT         | `{}` or `{ "owner": "handle.example" }` |
| `inviteUser`         | Owner's method-bound PDS service JWT | `{ "actor": "handle.example" }`         |
| `revokeUser`         | Owner's method-bound PDS service JWT | `{ "actor": "handle.example" }`         |
| `createCredential`   | Owner's method-bound PDS service JWT | `{ "label": "Release pipeline" }`       |
| `listCredentials`    | Owner's method-bound PDS service JWT | `{}`                                    |
| `revokeCredential`   | Owner's method-bound PDS service JWT | `{ "id": "CREDENTIAL_UUID" }`           |
| `exchangeCredential` | CI credential in the bearer header   | `{}`                                    |

`createToken` and `exchangeCredential` return `token`, `expiresAt`, `cacheUrl`, and
`owner`. Secret-bearing responses use `Cache-Control: no-store`. Credential lists
return metadata only, with up to the latest 100 entries. A user may create CI
credentials for their own cache; an invitation alone does not grant management
of the owner's CI credentials.
