// Encoding and SemVer helpers; no SQL or table definitions.
import { createHash } from 'node:crypto';
import { InvalidRequestError } from '@atproto/xrpc-server';
import semver from 'semver';
import { toList } from '../../gleam.mjs';
export const queryHash = (query, author) =>
  createHash('sha256')
    .update(JSON.stringify([query, author]))
    .digest('hex');
export const encodeCursor = (time, uri, filter, downloads, name) =>
  Buffer.from(JSON.stringify({ time, uri, filter, downloads, name })).toString('base64url');
export function decodeCursor(value, filter) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    fail('InvalidCursor', 'Invalid pagination cursor');
  }
  if (
    parsed?.filter !== filter ||
    typeof parsed.time !== 'string' ||
    typeof parsed.uri !== 'string' ||
    !Number.isSafeInteger(parsed.downloads) ||
    parsed.downloads < 0 ||
    typeof parsed.name !== 'string' ||
    !parsed.uri.startsWith('at://')
  )
    fail('InvalidCursor', 'Cursor does not match this query');
  return [parsed.time, parsed.uri, parsed.downloads, parsed.name];
}
export function latest(packages) {
  const values = packages.toArray();
  const stable = values.filter((p) => !semver.prerelease(p.version));
  return (stable.length ? stable : values).sort((a, b) => semver.rcompare(a.version, b.version))[0];
}
export const words = (value) => toList(value.match(/[\p{L}\p{N}_]+/gu) ?? []);
export function fail(code, message) {
  throw new InvalidRequestError(message, code);
}

const utcDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export const recentDays = () => toList(Array.from({ length: 7 }, (_, i) => utcDay(i - 6)));
export const dayBeforeWeek = () => utcDay(-7);
export const tomorrow = () => utcDay(1);
