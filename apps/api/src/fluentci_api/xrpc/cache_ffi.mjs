import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { XRPCError } from '@atproto/xrpc-server';
import { resolveActor } from '../node/runtime_ffi.mjs';

const unavailable = () =>
  new XRPCError(503, 'Configure cache URL and Ed25519 signing key', 'CacheUnavailable');
function settings(server) {
  try {
    const value = server.options.cachePublicUrl ?? process.env.CACHE_PUBLIC_URL;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw unavailable();
    const file =
      server.options.cacheTokenPrivateKeyFile ?? process.env.CACHE_TOKEN_PRIVATE_KEY_FILE;
    if (!file) throw unavailable();
    // Load once per process: restart the API after rotating keys.
    server.cacheSigningKey ??= createPrivateKey(readFileSync(file));
    if (server.cacheSigningKey.asymmetricKeyType !== 'ed25519') throw unavailable();
    return { base: url.href.replace(/\/$/, ''), key: server.cacheSigningKey };
  } catch {
    throw unavailable();
  }
}
export async function createToken(server, request, allowed) {
  const actor = request.auth.credentials.did;
  const owner = request.input.body.owner
    ? await resolveActor(server, request.input.body.owner)
    : actor;
  if (!(await allowed(owner, actor)))
    throw new XRPCError(403, 'The cache owner must invite you first', 'AccessDenied');
  return mintToken(server, owner, actor);
}
export function mintToken(server, owner, actor, scope = 'cache:upload') {
  const { base, key } = settings(server);
  const cache = createHash('sha256').update(owner).digest('hex');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: process.env.SERVICE_DID ?? 'did:web:api.fluentci.io',
      aud: 'fluentci-cache',
      sub: actor,
      cache,
      scope,
      iat: now,
      nbf: now,
      exp,
      jti: randomUUID(),
    }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const token = `${unsigned}.${sign(null, Buffer.from(unsigned), key).toString('base64url')}`;
  return {
    encoding: 'application/json',
    body: {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      cacheUrl: `${base}/accounts/${cache}`,
      owner,
    },
    headers: { 'Cache-Control': 'no-store' },
  };
}
export async function membership(server, request, active, grant) {
  const owner = request.auth.credentials.did;
  const actor = await resolveActor(server, request.input.body.actor);
  if (owner === actor)
    throw new XRPCError(400, 'Owners always have upload access', 'InvalidRequest');
  await grant(owner, actor, active);
  return { encoding: 'application/json', body: { owner, actor, active } };
}

export async function manageCache(server, request, action, record = async () => {}) {
  if (action === 'clear' && request.input.body.confirm !== true)
    throw new XRPCError(400, 'Confirm cache clearing', 'InvalidRequest');
  const actor = request.auth.credentials.did;
  const minted = mintToken(server, actor, actor, 'cache:manage').body;
  try {
    const response = await (server.options.cacheFetch ?? fetch)(`${minted.cacheUrl}/_admin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${minted.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request.input.body, action }),
      signal: AbortSignal.timeout(305000),
      redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 400)
        throw new XRPCError(400, 'Invalid cache key or pagination', 'InvalidRequest');
      throw new Error('Cache management unavailable');
    }
    const data = await response.json();
    if (action === 'list') {
      const observed = new Date().toISOString();
      await record(actor, observed.slice(0, 10), data.totalBytes, data.totalKeys, observed);
    }
    if (data.cursor === null) delete data.cursor;
    return { encoding: 'application/json', body: data, headers: { 'Cache-Control': 'no-store' } };
  } catch (error) {
    if (error instanceof XRPCError) throw error;
    throw new XRPCError(
      503,
      'Cache management failed; refresh to check the current state before retrying',
      'CacheUnavailable',
    );
  }
}

export async function listCollaborators(request, list) {
  const rows = (
    await list(request.auth.credentials.did, request.input.body.cursor ?? '')
  ).toArray();
  const actors = rows.slice(0, 100).map((row) => row.actor);
  return {
    encoding: 'application/json',
    body: { actors, ...(rows.length > 100 ? { cursor: actors.at(-1) } : {}) },
    headers: { 'Cache-Control': 'no-store' },
  };
}

export async function usageHistory(request, query) {
  const now = new Date();
  const after = new Date(now);
  after.setUTCDate(after.getUTCDate() - 14);
  const before = new Date(now);
  before.setUTCDate(before.getUTCDate() + 1);
  const rows = (
    await query(
      request.auth.credentials.did,
      after.toISOString().slice(0, 10),
      before.toISOString().slice(0, 10),
    )
  ).toArray();
  return {
    encoding: 'application/json',
    body: {
      samples: rows.map((row) => ({
        date: row.date,
        bytes: row.bytes,
        keyCount: row.key_count,
        observedAt: row.observed_at,
      })),
    },
    headers: { 'Cache-Control': 'no-store' },
  };
}
