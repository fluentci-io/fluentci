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
export function mintToken(server, owner, actor) {
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
      scope: 'cache:upload',
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
