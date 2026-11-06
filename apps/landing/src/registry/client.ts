export const api = "https://api.fluentci.io/xrpc/io.fluentci.registry";

export interface PluginFunction {
  name: string;
  description?: string;
  args?: { name: string; type: string }[];
  returnType?: string;
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;
  publishedAt: string;
  license: string;
  url: string;
  uri: string;
  logo?: string;
  repository?: string;
  subdir?: string;
  readmeUrl?: string;
  topics?: string[];
  os?: string[];
  arch?: string[];
  functions?: PluginFunction[];
  downloads?: number;
  dailyDownloads?: { date: string; downloads: number }[];
}

export interface Profile {
  did: string;
  handle: string;
  avatar?: string;
}

export function httpUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? "");
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Optional URLs may be absent. */
  }
  return undefined;
}

export function moduleTitle(plugin: Plugin, handle: string) {
  return handle.toLowerCase() === "fluentci.io"
    ? plugin.name
    : `@${handle}/${plugin.name}`;
}

export function recordKey(plugin: Plugin) {
  return plugin.uri.split("/").pop() || `${plugin.name}-${plugin.version}`;
}

export function runCommand(plugin: Plugin, handle: string, job?: string) {
  return `fluentci run @${handle}/${plugin.name}@${plugin.version}${job ? ` ${job}` : ""}`;
}

export async function query<T>(
  method: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${api}.${method}?${params}`, { signal });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Module not found."
        : "The registry is unavailable. Please try again.",
    );
  return response.json() as Promise<T>;
}

const profiles = new Map<string, Profile>();
export async function getProfiles(dids: string[], signal: AbortSignal) {
  const missing = [...new Set(dids)].filter((did) => !profiles.has(did));
  if (missing.length) {
    const params = new URLSearchParams();
    missing.forEach((did) => params.append("actors", did));
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${params}`,
      { signal },
    );
    if (response.ok) {
      const data = (await response.json()) as { profiles: Profile[] };
      for (const profile of data.profiles ?? []) {
        if (
          missing.includes(profile.did) &&
          /^[a-z0-9.-]+\.[a-z]+$/i.test(profile.handle) &&
          profile.handle !== "handle.invalid"
        )
          profiles.set(profile.did, profile);
      }
    }
  }
  return Object.fromEntries(
    dids.flatMap((did) =>
      profiles.has(did) ? [[did, profiles.get(did)!]] : [],
    ),
  );
}

export async function getPlugin(
  handle: string,
  rkey: string,
  signal: AbortSignal,
) {
  const parts =
    /^([a-z][a-z0-9-]{0,63})-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(rkey);
  if (!parts) throw new Error("Invalid module record key.");
  const data = await query<{ package: Plugin }>(
    "getPackage",
    new URLSearchParams({ author: handle, name: parts[1], version: parts[2] }),
    signal,
  );
  if (recordKey(data.package) !== rkey) throw new Error("Module not found.");
  return data.package;
}

// Prefer the published URL. GitHub repository metadata provides a README fallback.
export function readmeUrl(plugin: Plugin) {
  const explicit = httpUrl(plugin.readmeUrl);
  if (explicit) {
    const url = new URL(explicit);
    if (url.hostname === "github.com" && url.pathname.includes("/blob/")) {
      url.hostname = "raw.githubusercontent.com";
      url.pathname = url.pathname.replace("/blob/", "/");
    }
    return url.href;
  }
  const repository = httpUrl(plugin.repository);
  if (!repository) return undefined;
  const url = new URL(repository);
  const parts = url.pathname
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter(Boolean);
  if (url.hostname !== "github.com" || parts.length !== 2) return undefined;
  const subdir =
    plugin.subdir?.split("/").filter((part) => part && part !== ".") ?? [];
  if (subdir.includes("..")) return undefined;
  return `https://raw.githubusercontent.com/${parts.map(encodeURIComponent).join("/")}/HEAD/${[...subdir, "README.md"].map(encodeURIComponent).join("/")}`;
}
