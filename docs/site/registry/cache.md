---
title: "Cache access"
description: "Generate cache upload tokens, invite collaborators, and authorize CI with revocable credentials."
section: "Studio and publishing"
url: "/registry/cache/"
source: "registry/cache.md"
---

For client-specific token examples, see [remote build cache](/guides/build-cache/).

## Generate an upload token

Open [Build cache](https://fluentci.io/cache) and sign in with your AT Protocol
account. Older sessions show **Authorize cache access**; approve the additional
cache permissions before continuing.

Choose **Generate upload token** to receive your account's cache URL and an
upload token that remains valid until revoked. The cache page always uses your signed-in account's cache.
Invited collaborators can use the `createToken` API with the owner's handle or DID
to request a token for a shared cache.
The browser obtains a short-lived PDS service-auth JWT bound to the exact cache
API method, then exchanges it at the FluentCI API. PDS session credentials are
not sent to the FluentCI API. Upload tokens remain in page memory and disappear
on sign-out or reload; this clears the displayed secret but does not revoke the token.

Configure your cache client with the returned URL and a bearer token or a
Basic-auth password. For the Go helper:

```sh
export FLUENTCI_CACHE_URL='https://cache.fluentci.io/did:plc:YOUR_DID'
export FLUENTCI_CACHE_TOKEN='UPLOAD_TOKEN'
export GOCACHEPROG='fluentci-cache gocache'
go build ./...
```

Use **Generate another token** to create a separate upload token. Generating one
does not revoke previous tokens. Cached files remain publicly readable through a correctly
configured CDN; invitations and tokens control uploads.

**Issued upload tokens** lists tokens in pages of 20 with creation time, expiry (Never for new tokens),
and status. Secrets are always redacted in the list and are never stored by the
API. Copy a newly generated secret before leaving the page. **Revoke** disables
that token for subsequent uploads, including tokens issued through CI exchanges
or to collaborators for your cache. Revocation persists across cache restarts
and clearing storage. Existing in-flight uploads can finish.

Only tokens issued after token tracking was installed can be listed. Earlier
tokens retain their original signed expiry; generate a new token once to obtain
a token without expiry. Older sign-in sessions need the new
`listTokens` and `revokeToken` permissions before managing this list.

## Invite a collaborator

In **Invite collaborators**, enter a handle or DID and choose **Invite user**.
This grants upload access to your own cache. Share your handle with the user;
they sign in and generate their own upload token with you as the cache owner.
No email or external invitation message is sent automatically.

**Revoke access** immediately prevents that user from generating more tokens.
Already-issued upload tokens remain valid until
you revoke them individually in **Issued upload tokens**.

## Connect CI

In **CI credentials**, name and create a credential for your own cache. Copy its
secret immediately: it is shown once and cannot be recovered from the API.
The server stores only a SHA-256 hash. Save the secret as
`FLUENTCI_CACHE_CREDENTIAL` in your CI secret store, never in source control.
Credentials expire after 90 days and can be revoked in the same page. Create a
replacement and update the CI secret before revoking the old credential.

A CI run can exchange this credential for an upload token that remains valid until revoked. CI does
not need an AT Protocol account password, OAuth session, or browser login.
Revoking a CI credential blocks new exchanges; existing upload tokens must be
revoked individually. You can also store an upload token directly in your CI secret
store and reuse it across runs. A CI credential only authorizes the token exchange endpoint, with no
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
| `listTokens`         | Owner's method-bound PDS service JWT | `{}` or `{ "cursor": "CURSOR" }`        |
| `revokeToken`        | Owner's method-bound PDS service JWT | `{ "id": "TOKEN_UUID" }`                |
| `exchangeCredential` | CI credential in the bearer header   | `{}`                                    |

`createToken` and `exchangeCredential` return `id`, `token`, `cacheUrl`, `canonicalCacheUrl`, and
`owner`. New upload tokens omit `expiresAt`; legacy records may include it. Secret-bearing responses use `Cache-Control: no-store`. Credential lists
return metadata only, with up to the latest 100 entries. A user may create CI
credentials for their own cache; an invitation alone does not grant management
of the owner's CI credentials.

## Explore storage and manage collaborators

On the cache page, enter a collaborator's handle to see account suggestions.
Select an account with the mouse or arrow keys and Enter, then invite them.
Use **Refresh collaborators** to list users with upload access and **Remove** to
revoke a grant. Revoke existing upload tokens individually.

Under **Cache storage**, choose **Explore keys** to view keys, byte sizes and
modification dates. Filter by a key prefix and use **More keys** for further
pages. Total bytes and key count cover your entire account cache. They are
computed from object metadata, so large caches take longer and concurrent
uploads can change the totals.

Only owners can manage storage. Delete individual objects after confirmation,
or use **Clear cache** and type `CLEAR` to remove all objects in your own cache.
Other accounts and legacy shared storage are unaffected. Invited users and CI
upload credentials cannot list or delete storage. Deletions are permanent at the
origin; public CDN copies may remain until their cached responses expire. Pause
uploads when clearing a cache if you need it to remain empty.

The owner-only JSON procedures are `io.fluentci.cache.listKeys` (optional
`prefix`, `cursor`, `limit` up to 200), `io.fluentci.cache.deleteKey` (`key`),
`io.fluentci.cache.clearCache` (`confirm: true`) and
`io.fluentci.cache.listCollaborators` (optional `cursor`). Each requires its own
method-scoped service-auth JWT. Storage management needs S3 list and delete
permissions in addition to upload permissions.

## Usage chart

The storage view includes daily bars for the last 30 UTC days. Switch between
stored bytes and object count. Hover over a bar or focus it with the keyboard to
inspect a day's measurement. Missing historical samples show **No data**, not
zero usage. A measured empty cache is shown as zero.

Refreshing the listing records the current day's latest measurement. The hourly
snapshot job keeps registered owners updated between visits; see
[cache deployment](/development/build-cache/#usage-history).
These measurements come from object metadata and include stored cache objects.
They do not count direct CDN reads, request traffic, or edge cache hits.

New `cacheUrl` values use the owner's stable DID, such as
`https://cache.fluentci.io/did:plc:YOUR_DID`. Handle aliases use
`https://cache.fluentci.io/@your.handle`. Existing `/accounts/<owner-hash>` URLs
still access the same cache with the same tokens. `canonicalCacheUrl` exposes
that hash namespace for gRPC instance names, Turborepo team identifiers, and
OCI repository names.

The public GET query `io.fluentci.cache.resolveAccount?actor=your.handle` returns
`owner` (DID) and `cacheId` (the existing SHA-256 namespace). Handle resolution
verifies that the DID document claims the handle. It grants no upload rights;
all token issuance and ownership checks remain authenticated.
