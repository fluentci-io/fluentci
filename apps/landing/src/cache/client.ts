import type { Account } from "../auth/client";
import { hasCachePermissions, type CacheMethod } from "../auth/permissions";
import { ok } from "@atcute/client";

const api = "https://api.fluentci.io";
export type UploadToken = {
  id: string;
  token: string;
  cacheUrl: string;
  expiresAt: string;
  owner: string;
};
export type UploadTokenRecord = {
  id: string;
  owner: string;
  actor: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
};
export type Credential = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
};
export type NewCredential = Credential & { credential: string; owner: string };
export class CachePermissionError extends Error {}

export async function cacheRequest<T>(
  account: Account,
  method: CacheMethod,
  input: object,
  signal: AbortSignal,
): Promise<T> {
  if (!hasCachePermissions(account.agent.session.token.scope))
    throw new CachePermissionError("Authorize cache access to continue.");
  const service = await account.rpc.get("com.atproto.server.getServiceAuth", {
    params: {
      aud: "did:web:api.fluentci.io",
      lxm: `io.fluentci.cache.${method}`,
    },
    signal,
  });
  if (
    !service.ok &&
    ["AuthRequired", "InvalidToken", "InsufficientScope", "Forbidden"].includes(
      service.data.error,
    )
  )
    throw new CachePermissionError("Authorize cache access to continue.");
  const { token } = ok(service);
  const response = await fetch(`${api}/xrpc/io.fluentci.cache.${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || "The cache request failed.");
  return data as T;
}
