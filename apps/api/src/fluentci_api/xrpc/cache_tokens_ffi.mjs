import { XRPCError } from '@atproto/xrpc-server';
import { manageCache } from './cache_ffi.mjs';

export async function listTokens(request, list) {
  const rows = (
    await list(request.auth.credentials.did, request.input.body.cursor ?? '')
  ).toArray();
  const tokens = rows.slice(0, 20).map((row) => ({
    id: row.id,
    owner: row.owner,
    actor: row.actor,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    active: row.active,
  }));
  return {
    encoding: 'application/json',
    body: { tokens, ...(rows.length > 20 ? { cursor: tokens.at(-1).id } : {}) },
    headers: { 'Cache-Control': 'no-store' },
  };
}

export async function revokeToken(server, request, find, revoke) {
  const row = (await find(request.input.body.id)).toArray()[0];
  if (!row || row.owner !== request.auth.credentials.did)
    throw new XRPCError(404, 'Upload token not found', 'TokenNotFound');
  if (row.active) {
    await manageCache(server, request, 'revokeToken');
    await revoke(row.owner, row.id);
  }
  return {
    encoding: 'application/json',
    body: { revoked: true },
    headers: { 'Cache-Control': 'no-store' },
  };
}
