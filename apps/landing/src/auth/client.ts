import {
  accountKey,
  beginBrowserSession,
  clearCredentials,
  endBrowserSession,
  prepareBrowserSession,
} from "./storage";
import type {} from "@atcute/atproto";
import { Client, ok } from "@atcute/client";
import {
  configureOAuth,
  createAuthorizationUrl,
  finalizeAuthorization,
  OAuthUserAgent,
  getSession,
  deleteStoredSession,
  type Session,
} from "@atcute/oauth-browser-client";
import {
  CompositeDidDocumentResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  XrpcHandleResolver,
} from "@atcute/identity-resolver";
import { getProfiles, type Profile, type Plugin } from "../registry/client";

export const scope = "atproto repo:io.fluentci.like repo:io.fluentci.plugin";
export { accountKey } from "./storage";
const returnKey = "fluentci-oauth-return";
const redirect = `${location.origin}/oauth/callback`;
const development = /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(location.origin);
const identityResolver = new LocalActorResolver({
  handleResolver: new XrpcHandleResolver({
    serviceUrl: "https://public.api.bsky.app",
  }),
  didDocumentResolver: new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver(),
      web: new WebDidDocumentResolver(),
    },
  }),
});
configureOAuth({
  metadata: {
    client_id: development
      ? `http://localhost?redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}`
      : "https://fluentci.io/oauth-client-metadata.json",
    redirect_uri: development ? redirect : "https://fluentci.io/oauth/callback",
  },
  identityResolver,
  storageName: "fluentci-oauth",
  onPersistError: () => {
    throw Error("Allow browser storage to sign in.");
  },
});

export type Account = {
  did: Session["info"]["sub"];
  agent: OAuthUserAgent;
  rpc: Client;
  profile?: Profile;
};
async function account(session: Session): Promise<Account> {
  const agent = new OAuthUserAgent(session);
  const profiles = await getProfiles(
    [agent.sub],
    AbortSignal.timeout(8000),
  ).catch(() => ({}) as Record<string, Profile>);
  let profile = profiles[agent.sub];
  if (!profile) {
    const resolved = await identityResolver
      .resolve(agent.sub, { signal: AbortSignal.timeout(8000) })
      .catch(() => undefined);
    if (resolved && resolved.handle !== "handle.invalid")
      profile = { did: agent.sub, handle: resolved.handle };
  }
  return {
    did: agent.sub,
    agent,
    rpc: new Client({ handler: agent }),
    profile,
  };
}
export const safeReturn = (path: string | null) =>
  path?.startsWith("/") &&
  !path.startsWith("//") &&
  !path.startsWith("/oauth/") &&
  !path.includes("\\")
    ? path
    : "/";
let callback: Promise<null> | undefined;
export async function restore(): Promise<Account | null> {
  if (location.pathname === "/oauth/callback") {
    return (callback ??= (async () => {
      const params = new URLSearchParams(
        location.hash.slice(1) || location.search.slice(1),
      );
      history.replaceState(null, "", "/oauth/callback");
      if (!params.has("state"))
        throw Error(
          "This sign-in link is missing its state. Please sign in again.",
        );
      const { session } = await finalizeAuthorization(params);
      beginBrowserSession();
      localStorage.setItem(accountKey, session.info.sub);
      const destination = safeReturn(sessionStorage.getItem(returnKey));
      sessionStorage.removeItem(returnKey);
      location.replace(destination);
      return null;
    })());
  }
  const did = prepareBrowserSession();
  if (!did?.startsWith("did:")) return null;
  try {
    return await account(
      await getSession(did as Session["info"]["sub"], { allowStale: true }),
    );
  } catch {
    deleteStoredSession(did as Session["info"]["sub"]);
    if (localStorage.getItem(accountKey) === did) endBrowserSession();
    return null;
  }
}
export async function signIn(handle: string, create = false) {
  if (!development && location.origin !== "https://fluentci.io")
    throw Error(
      "Sign in at https://fluentci.io, or use 127.0.0.1 for local development.",
    );
  sessionStorage.setItem(
    returnKey,
    safeReturn(location.pathname + location.search + location.hash),
  );
  const identifier = handle.trim().replace(/^@/, "").toLowerCase();
  if (
    !create &&
    !/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(
      identifier,
    )
  )
    throw Error(
      "Enter a complete AT Protocol handle, such as name.bsky.social.",
    );
  beginBrowserSession();
  const url = await createAuthorizationUrl({
    target: create
      ? { type: "pds", serviceUrl: "https://selfhosted.social" }
      : { type: "account", identifier: identifier as `${string}.${string}` },
    scope,
    ...(create ? { prompt: "create" } : {}),
  });
  location.assign(url);
}
export async function signOut(current: Account, revocation: Promise<void>) {
  endBrowserSession();
  // Remove all local credentials immediately, even if revocation is unavailable.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      revocation,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5000);
      }),
    ]);
  } catch {
    /* Local sign-out remains complete. */
  } finally {
    clearTimeout(timeout);
    deleteStoredSession(current.did);
    clearCredentials();
  }
}

export type LikeRecord = { uri: string; subject: { uri: string; cid: string } };

export function matchesModule(record: LikeRecord, plugin: Plugin) {
  const prefix = `at://${plugin.author}/io.fluentci.plugin/${plugin.name}-`;
  return (
    record.subject.uri.startsWith(prefix) &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      record.subject.uri.slice(prefix.length),
    )
  );
}

export async function listLikes(
  current: Account,
  signal?: AbortSignal,
): Promise<LikeRecord[]> {
  const records: LikeRecord[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    signal?.throwIfAborted();
    const result = await ok(
      current.rpc.get("com.atproto.repo.listRecords", {
        params: {
          repo: current.did,
          collection: "io.fluentci.like",
          limit: 100,
          cursor,
        },
        signal,
      }),
    );
    for (const record of result.records) {
      if (!record.uri.startsWith(`at://${current.did}/io.fluentci.like/`))
        continue;
      const value = record.value;
      if (
        typeof value !== "object" ||
        value === null ||
        !("$type" in value) ||
        value.$type !== "io.fluentci.like" ||
        !("subject" in value)
      )
        continue;
      const subject = value.subject;
      if (
        typeof subject !== "object" ||
        subject === null ||
        !("uri" in subject) ||
        !("cid" in subject) ||
        typeof subject.uri !== "string" ||
        typeof subject.cid !== "string"
      )
        continue;
      records.push({
        uri: record.uri,
        subject: { uri: subject.uri, cid: subject.cid },
      });
    }
    cursor = result.cursor;
    if (cursor && cursors.has(cursor))
      throw Error("The PDS returned a repeated likes cursor.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return records;
}

export async function writeLike(
  current: Account,
  plugin: Plugin,
  liked: boolean,
): Promise<LikeRecord[]> {
  const existing = (await listLikes(current)).filter((record) =>
    matchesModule(record, plugin),
  );
  if (liked) {
    if (existing.length) return existing;
    if (!plugin.cid)
      throw Error(
        "The module CID is unavailable. Refresh this page and try again.",
      );
    const subject = { uri: plugin.uri, cid: plugin.cid };
    const result = await ok(
      current.rpc.post("com.atproto.repo.createRecord", {
        input: {
          repo: current.did,
          collection: "io.fluentci.like",
          record: {
            $type: "io.fluentci.like",
            subject,
            createdAt: new Date().toISOString(),
          },
        },
      }),
    );
    return [{ uri: result.uri, subject }];
  }
  await Promise.all(
    existing.map(async (record) => {
      const rkey = record.uri.split("/").pop()!;
      const result = await current.rpc.post("com.atproto.repo.deleteRecord", {
        input: { repo: current.did, collection: "io.fluentci.like", rkey },
      });
      if (!result.ok && result.data.error === "RecordNotFound") return;
      ok(result);
    }),
  );
  return [];
}
