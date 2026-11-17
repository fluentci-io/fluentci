import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exchangeCredential, main } from '../../../scripts/cache-token.mjs';
const credential = `fc_cache_ci_78ba2cf4-9844-4af8-a52c-4500e28bdc9e.${'a'.repeat(43)}`;
const value = {
  token: 'signed.upload.token',
  cacheUrl: 'https://cache.example/accounts/hash',
};

test('CI helper exchanges credentials over HTTPS without following redirects', async () => {
  let input;
  const output = await exchangeCredential(credential, undefined, async (url, options) => {
    input = { url, options };
    return Response.json(value);
  });
  assert.equal(input.url, 'https://api.fluentci.io/xrpc/io.fluentci.cache.exchangeCredential');
  assert.equal(input.options.headers.Authorization, `Bearer ${credential}`);
  assert.equal(input.options.redirect, 'error');
  assert.equal(output.token, value.token);
  assert.equal(output.expiresAt, undefined);
  const legacy = await exchangeCredential(credential, undefined, async () =>
    Response.json({ ...value, expiresAt: '2099-01-01T00:00:00.000Z' }),
  );
  assert.equal(legacy.expiresAt, '2099-01-01T00:00:00.000Z');
  await assert.rejects(
    exchangeCredential(credential, undefined, async () =>
      Response.json({ ...value, expiresAt: '2000-01-01T00:00:00.000Z' }),
    ),
    /expiry/,
  );
  await assert.rejects(exchangeCredential(credential, 'http://untrusted.example'), /HTTPS/);
  await assert.rejects(exchangeCredential('invalid'), /CI credential/);
  await assert.rejects(
    exchangeCredential(credential, undefined, async () => new Response('', { status: 401 })),
    /HTTP 401/,
  );
  await assert.rejects(
    exchangeCredential(credential, undefined, async () =>
      Response.json({ ...value, token: 'token\nEVIL=1' }),
    ),
    /Invalid cache token/,
  );
  await assert.rejects(
    exchangeCredential(credential, undefined, async () =>
      Response.json({ ...value, cacheUrl: "https://cache.example/';attack" }),
    ),
    /Invalid cache URL/,
  );
});

test('CI helper writes private environment files and never prints the secret', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cache-helper-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async () => Response.json(value));
  let stdout = '';
  let stderr = '';
  t.mock.method(process.stdout, 'write', (text) => {
    stdout += text;
    return true;
  });
  t.mock.method(process.stderr, 'write', (text) => {
    stderr += text;
    return true;
  });
  const file = join(directory, 'cache.env');
  await main(['--env-file', file], { FLUENTCI_CACHE_CREDENTIAL: credential });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.match(readFileSync(file, 'utf8'), /FLUENTCI_CACHE_TOKEN='signed.upload.token'/);
  assert.match(stderr, /valid until revoked/);
  assert.match(readFileSync(file, 'utf8'), /FLUENTCI_CACHE_EXPIRES_AT=''/);
  assert.equal(stdout.includes(value.token), false);
  assert.equal(stderr.includes(value.token), false);
  assert.equal(readFileSync(file, 'utf8').includes(credential), false);
});
