import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { XRPCError } from '@atproto/xrpc-server';
import { mintToken } from './cache_ffi.mjs';

const digest = (value) => createHash('sha256').update(value).digest();
const view = (row) => ({
  id: row.id,
  label: row.label,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  active: row.active,
});
const json = (body) => ({
  encoding: 'application/json',
  body,
  headers: { 'Cache-Control': 'no-store' },
});
export async function createCredential(server, request, save) {
  // Fail before storing a credential when uploads are not configured.
  mintToken(server, request.auth.credentials.did, request.auth.credentials.did);
  const owner = request.auth.credentials.did;
  const id = randomUUID();
  const label = request.input.body.label.trim();
  if (!label) throw new XRPCError(400, 'A credential name is required', 'InvalidRequest');
  const credential = `fc_cache_ci_${id}.${randomBytes(32).toString('base64url')}`;
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 90 * 86400_000).toISOString();
  await save(id, owner, label, digest(credential).toString('hex'), createdAt, expiresAt);
  return json({ id, owner, label, credential, createdAt, expiresAt, active: true });
}
export async function listCredentials(request, list) {
  const rows = await list(request.auth.credentials.did);
  return json({ credentials: rows.toArray().map(view) });
}
export async function revokeCredential(request, revoke) {
  await revoke(request.auth.credentials.did, request.input.body.id);
  return json({ revoked: true });
}
export async function exchangeCredential(server, request, find) {
  const credential = request.auth.credentials.cacheCredential;
  const match =
    /^fc_cache_ci_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/.exec(
      credential,
    );
  const denied = () => new XRPCError(401, 'A valid CI credential is required', 'AuthRequired');
  if (!match) throw denied();
  const rows = (await find(match[1])).toArray();
  const row = rows[0];
  if (
    !row ||
    !row.active ||
    Date.parse(row.expires_at) <= Date.now() ||
    !timingSafeEqual(digest(credential), Buffer.from(row.digest, 'hex'))
  )
    throw denied();
  return mintToken(server, row.owner, row.owner);
}
