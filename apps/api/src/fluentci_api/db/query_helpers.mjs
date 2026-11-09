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
// Stable releases take precedence over prereleases, matching getPackage.
export function compareVersions(left, right) {
  const leftPreview = Boolean(semver.prerelease(left));
  const rightPreview = Boolean(semver.prerelease(right));
  if (leftPreview !== rightPreview) return leftPreview ? -1 : 1;
  return semver.compare(left, right);
}
export function latest(packages) {
  const values = packages.toArray();
  return values.sort(
    (a, b) => compareVersions(b.version, a.version) || a.uri.localeCompare(b.uri),
  )[0];
}
export const words = (value) => toList(value.match(/[\p{L}\p{N}_]+/gu) ?? []);
export function fail(code, message) {
  throw new InvalidRequestError(message, code);
}

const utcDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
export const recentDays = () => toList(Array.from({ length: 7 }, (_, i) => utcDay(i - 6)));
export const dayBeforeWeek = () => utcDay(-7);
export const tomorrow = () => utcDay(1);
