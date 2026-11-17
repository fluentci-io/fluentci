import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { Secp256k1Keypair } from '@atproto/crypto';
import { createServiceJwt } from '@atproto/xrpc-server';
process.env.FLUENTCI_API_ROOT = fileURLToPath(new URL('..', import.meta.url));
const nativeDb =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/db/client_ffi.mjs');
const runtime =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/node/runtime_ffi.mjs');
const { register } =
  await import('../build/dev/javascript/fluentci_api/fluentci_api/xrpc/routes.mjs');
const did = 'did:plc:abcdefghijklmnopqrstuvwx';
const other = 'did:plc:zyxwvutsrqponmlkjihgfedcb';

async function fixture(t, invalid = false, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cache-api-test-'));
  const connection = await nativeDb.open({ url: `file:${join(directory, 'registry.sqlite')}` });
  const keypair = await Secp256k1Keypair.create();
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyFile = join(directory, 'private.pem');
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const instance = runtime.create(connection, {
    resolveSigningKey: async () => keypair.did(),
    resolveActor: async (actor) => (actor === 'owner.test' ? did : actor),
    cachePublicUrl: invalid ? 'http://cache.example' : 'https://cache.example',
    cacheTokenPrivateKeyFile: keyFile,
    ...options,
  });
  register(instance, connection);
  const http = runtime.app(instance).listen(0, '127.0.0.1');
  await once(http, 'listening');
  t.after(async () => {
    await new Promise((resolve) => http.close(resolve));
    await nativeDb.close(connection);
    rmSync(directory, { recursive: true, force: true });
  });
  async function call(method, actor = did, body = {}, overrides = {}) {
    const token =
      actor &&
      (await createServiceJwt({
        iss: actor,
        aud: 'did:web:api.fluentci.io',
        lxm: `io.fluentci.cache.${method}`,
        keypair,
        ...overrides,
      }));
    return fetch(`http://127.0.0.1:${http.address().port}/xrpc/io.fluentci.cache.${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  const exchange = (credential) =>
    fetch(`http://127.0.0.1:${http.address().port}/xrpc/io.fluentci.cache.exchangeCredential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: '{}',
    });
  return { call, connection, publicKey, exchange };
}

test('account cache tokens require method-scoped auth, owner grants and respect revocation', async (t) => {
  const { call, connection, publicKey } = await fixture(t);
  assert.equal((await call('createToken', null)).status, 401);
  assert.equal((await call('inviteUser', null, { actor: other })).status, 401);
  assert.equal((await call('revokeUser', null, { actor: other })).status, 401);
  assert.equal(
    (await call('createToken', did, {}, { lxm: 'io.fluentci.registry.publish' })).status,
    401,
  );
  assert.equal((await call('createToken', did, {}, { aud: 'did:web:other.example' })).status, 401);
  const response = await call('createToken');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const own = await response.json();
  const hash = createHash('sha256').update(did).digest('hex');
  assert.equal(own.owner, did);
  assert.equal(own.cacheUrl, `https://cache.example/accounts/${hash}`);
  const [header, payload, signature] = own.token.split('.');
  assert.equal(
    verify(
      null,
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    ),
    true,
  );
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.sub, did);
  assert.equal(claims.cache, hash);
  assert.equal(claims.scope, 'cache:upload');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(new Date(own.expiresAt).getTime(), claims.exp * 1000);
  assert.equal((await call('createToken', other, { owner: did })).status, 403);
  // An invitation grants access to the caller's own cache only.
  assert.equal((await call('inviteUser', other, { actor: did })).status, 200);
  assert.equal((await call('createToken', other, { owner: did })).status, 403);
  assert.equal((await call('inviteUser', did, { actor: other })).status, 200);
  assert.equal((await call('inviteUser', did, { actor: other })).status, 200);
  const collaborators = await call('listCollaborators');
  assert.deepEqual((await collaborators.json()).actors, [other]);
  assert.deepEqual((await (await call('listCollaborators', other)).json()).actors, [did]);
  const sharedResponse = await call('createToken', other, { owner: 'owner.test' });
  assert.equal(sharedResponse.status, 200);
  const shared = await sharedResponse.json();
  assert.equal(shared.cacheUrl, own.cacheUrl);
  assert.equal(JSON.parse(Buffer.from(shared.token.split('.')[1], 'base64url')).sub, other);
  assert.equal((await call('revokeUser', did, { actor: other })).status, 200);
  assert.equal((await call('createToken', other, { owner: did })).status, 403);
  assert.deepEqual((await (await call('listCollaborators')).json()).actors, []);
  assert.equal((await call('createToken', did)).status, 200);
  assert.equal((await call('revokeUser', did, { actor: did })).status, 400);
  assert.equal((await call('inviteUser', did, { actor: did })).status, 400);
  assert.equal((await call('inviteUser', did, { actor: 'owner.test' })).status, 400);
  const rows = await connection.client.execute('SELECT * FROM cache_members');
  assert.equal(rows.rows.find((row) => row.owner === did && row.actor === other).active, 0);
});

test('cache token issuance fails closed for invalid configuration', async (t) => {
  const { call } = await fixture(t, true);
  const response = await call('createToken');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'CacheUnavailable');
});

test('CI credentials are shown once, hashed at rest, owner scoped, expiring and revocable', async (t) => {
  const { call, connection, publicKey, exchange } = await fixture(t);
  assert.equal((await call('createCredential', null, { label: 'Build' })).status, 401);
  const created = await call('createCredential', did, { label: 'Build' });
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const secret = await created.json();
  assert.match(secret.credential, /^fc_cache_ci_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(secret.expiresAt) - Date.parse(secret.createdAt), 90 * 86400_000);
  const stored = (await connection.client.execute('SELECT * FROM cache_credentials')).rows[0];
  assert.equal(stored.digest, createHash('sha256').update(secret.credential).digest('hex'));
  assert.equal(JSON.stringify(stored).includes(secret.credential), false);
  const listed = await call('listCredentials');
  const list = await listed.json();
  assert.equal(list.credentials.length, 1);
  assert.equal(list.credentials[0].id, secret.id);
  assert.equal(JSON.stringify(list).includes(secret.credential), false);
  assert.equal('digest' in list.credentials[0], false);
  assert.deepEqual((await (await call('listCredentials', other)).json()).credentials, []);
  assert.equal((await exchange()).status, 401);
  assert.equal((await exchange('invalid')).status, 401);
  const changed = secret.credential.slice(0, -2) + (secret.credential.endsWith('AA') ? 'BB' : 'AA');
  assert.equal((await exchange(changed)).status, 401);
  const issued = await exchange(secret.credential);
  assert.equal(issued.status, 200);
  assert.equal(issued.headers.get('cache-control'), 'no-store');
  const upload = await issued.json();
  assert.equal(upload.owner, did);
  const [header, payload, signature] = upload.token.split('.');
  assert.equal(
    verify(
      null,
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    ),
    true,
  );
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).scope, 'cache:upload');
  assert.equal((await call('revokeCredential', other, { id: secret.id })).status, 200);
  assert.equal((await exchange(secret.credential)).status, 200);
  assert.equal((await call('revokeCredential', did, { id: secret.id })).status, 200);
  assert.equal((await exchange(secret.credential)).status, 401);
  const second = await (await call('createCredential', did, { label: 'Expired' })).json();
  await connection.client.execute({
    sql: 'UPDATE cache_credentials SET expires_at = ? WHERE id = ?',
    args: ['2000-01-01T00:00:00.000Z', second.id],
  });
  assert.equal((await exchange(second.credential)).status, 401);
  // A CI credential authenticates only the exchange endpoint, never account management.
  assert.equal(
    (await call('createToken', did, {}, { lxm: 'io.fluentci.cache.exchangeCredential' })).status,
    401,
  );
});

test('owner storage procedures sign management scope and cannot select a different cache', async (t) => {
  const seen = [];
  const { call } = await fixture(t, false, {
    cacheFetch: async (url, options) => {
      const claims = JSON.parse(
        Buffer.from(options.headers.Authorization.slice(7).split('.')[1], 'base64url'),
      );
      seen.push({ url, claims, input: JSON.parse(options.body) });
      return Response.json(
        JSON.parse(options.body).action === 'list'
          ? {
              keys: [{ key: 'generic/a', size: 8, lastModified: new Date().toISOString() }],
              cursor: null,
              totalBytes: 8,
              totalKeys: 1,
            }
          : { deleted: 1 },
      );
    },
  });
  for (const method of ['listKeys', 'deleteKey', 'clearCache', 'listCollaborators']) {
    assert.equal(
      (
        await call(
          method,
          null,
          method === 'deleteKey'
            ? { key: 'generic/a' }
            : method === 'clearCache'
              ? { confirm: true }
              : {},
        )
      ).status,
      401,
    );
  }
  const list = await call('listKeys', did, { prefix: 'generic/', limit: 20 });
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal((await list.json()).totalBytes, 8);
  assert.equal(seen[0].claims.scope, 'cache:manage');
  assert.equal(seen[0].claims.sub, did);
  assert.equal(
    seen[0].url,
    `https://cache.example/accounts/${createHash('sha256').update(did).digest('hex')}/_admin`,
  );
  assert.equal((await call('clearCache', did, { confirm: false })).status, 400);
  assert.equal(seen.length, 1);
  assert.equal((await call('deleteKey', did, { key: 'generic/a' })).status, 200);
  assert.equal(seen[1].input.action, 'delete');
  assert.equal((await call('clearCache', other, { confirm: true })).status, 200);
  assert.equal(seen[2].claims.sub, other);
  assert.notEqual(seen[2].url, seen[0].url);
});

test('storage procedure reports failures without exposing backend details', async (t) => {
  const { call } = await fixture(t, false, {
    cacheFetch: async () => {
      throw Error('private backend details');
    },
  });
  const response = await call('listKeys');
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private backend details/);
});

test('cache usage history stores daily owner-scoped snapshots and returns only the last 30 UTC days', async (t) => {
  const { call, connection } = await fixture(t, false, {
    cacheFetch: async () => Response.json({ keys: [], totalBytes: 2048, totalKeys: 2 }),
  });
  const usage =
    await import('../build/dev/javascript/fluentci_api/fluentci_api/db/cache_usage.mjs');
  const date = (offset) => {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  for (let offset = -30; offset < 0; offset++) {
    await usage.record(connection, did, date(offset), 200, 2, `${date(offset)}T12:00:00.000Z`);
  }
  await usage.record(connection, other, date(-1), 999, 9, `${date(-1)}T12:00:00.000Z`);
  assert.equal((await call('listKeys')).status, 200);
  assert.equal((await call('getUsageHistory', null)).status, 401);
  const response = await call('getUsageHistory');
  assert.equal(response.status, 200);
  const output = await response.json();
  assert.deepEqual(
    output.samples.map((sample) => [sample.date, sample.bytes, sample.keyCount]),
    [...Array.from({ length: 29 }, (_, index) => [date(-29 + index), 200, 2]), [date(0), 2048, 2]],
  );
  assert.equal((await call('listKeys')).status, 200);
  assert.equal((await (await call('getUsageHistory')).json()).samples.length, 30);
  assert.deepEqual(
    (await (await call('getUsageHistory', other)).json()).samples.map((sample) => sample.bytes),
    [999],
  );
  const owners = (await usage.owners(connection, '')).toArray();
  assert.deepEqual(
    owners.map((row) => row.owner),
    [did, other].sort(),
  );
});

test('snapshot workers can open the shared database without replaying pending migrations', async (t) => {
  const { connection } = await fixture(t);
  const directory = mkdtempSync(join(tmpdir(), 'cache-pending-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const reopened = await nativeDb.open({
    url: connection.testUrl,
    migrate: false,
    migrationsFolder: directory,
  });
  await nativeDb.close(reopened);
});

test('upload token lists paginate without secrets and revocation is owner scoped and durable', async (t) => {
  const revoked = [];
  let fail = false;
  const { call, connection, exchange } = await fixture(t, false, {
    cacheFetch: async (_url, request) => {
      if (fail) return new Response('', { status: 503 });
      const input = JSON.parse(request.body);
      assert.equal(input.action, 'revokeToken');
      revoked.push(input.id);
      return Response.json({ revoked: true });
    },
  });
  const issued = [];
  for (let i = 0; i < 22; i++) issued.push(await (await call('createToken')).json());
  const foreign = await (await call('createToken', other)).json();
  const first = await (await call('listTokens')).json();
  assert.equal(first.tokens.length, 20);
  assert.ok(first.cursor);
  assert.equal(
    first.tokens.some((row) => row.id === foreign.id),
    false,
  );
  const second = await (await call('listTokens', did, { cursor: first.cursor })).json();
  assert.equal(second.tokens.length, 2);
  assert.equal(second.cursor, undefined);
  assert.equal(new Set([...first.tokens, ...second.tokens].map((row) => row.id)).size, 22);
  assert.equal(JSON.stringify(first).includes(issued[0].token), false);
  assert.equal(
    first.tokens.some((row) => 'token' in row),
    false,
  );
  const rows = await connection.client.execute('SELECT * FROM cache_tokens');
  assert.equal(JSON.stringify(rows.rows).includes(issued[0].token), false);
  assert.equal((await call('listTokens', null)).status, 401);
  assert.equal((await call('revokeToken', other, { id: issued[0].id })).status, 404);
  fail = true;
  assert.equal((await call('revokeToken', did, { id: issued[0].id })).status, 503);
  assert.equal(
    (
      await connection.client.execute({
        sql: 'SELECT active FROM cache_tokens WHERE id = ?',
        args: [issued[0].id],
      })
    ).rows[0].active,
    1,
  );
  fail = false;
  assert.equal((await call('revokeToken', did, { id: issued[0].id })).status, 200);
  assert.deepEqual(revoked, [issued[0].id]);
  assert.equal(
    (
      await connection.client.execute({
        sql: 'SELECT active FROM cache_tokens WHERE id = ?',
        args: [issued[0].id],
      })
    ).rows[0].active,
    0,
  );
  const credential = await (await call('createCredential', did, { label: 'CI' })).json();
  const ciToken = await (await exchange(credential.credential)).json();
  assert.ok(ciToken.id);
  assert.equal(
    (
      await connection.client.execute({
        sql: 'SELECT owner FROM cache_tokens WHERE id = ?',
        args: [ciToken.id],
      })
    ).rows[0].owner,
    did,
  );
});
