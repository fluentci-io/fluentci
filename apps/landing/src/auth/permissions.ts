export const cacheMethods = [
  "createToken",
  "inviteUser",
  "revokeUser",
  "createCredential",
  "listCredentials",
  "revokeCredential",
] as const;
export type CacheMethod = (typeof cacheMethods)[number];
// Each permission authorizes one FluentCI method, never arbitrary RPC methods.
// aud=* supports the API's bare DID audience, without requiring a DID service fragment.
export const cacheScopes = cacheMethods.map(
  (method) => `rpc:io.fluentci.cache.${method}?aud=*`,
);
export const scope = [
  "atproto",
  "repo:io.fluentci.like",
  "repo:io.fluentci.plugin",
  ...cacheScopes,
].join(" ");

export function hasCachePermissions(granted: string) {
  const scopes = new Set(granted.split(/\s+/));
  return cacheScopes.every((permission) => scopes.has(permission));
}
