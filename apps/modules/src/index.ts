export interface Env {
  DOWNLOAD_API_URL: string;
  DOWNLOAD_TRACKING_TOKEN?: string;
}

interface Download {
  handle: string;
  name: string;
  version: string;
}

const origin = "https://mod.fluentci.io";
const handlePattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

// Parsing is only for analytics. It never rewrites the upstream request URL.
export function downloadFromPath(path: string): Download | undefined {
  try {
    const segments = path.split("/").map(decodeURIComponent);
    if (
      segments.length !== 5 ||
      segments[0] !== "" ||
      !segments[1].startsWith("@")
    )
      return;
    const handle = segments[1].slice(1);
    const name = segments[2];
    const version = segments[3].replace(/^v/, "");
    const match = versionPattern.exec(version);
    if (
      handle.length > 253 ||
      !handlePattern.test(handle) ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(name) ||
      version.length > 128 ||
      !match ||
      segments[4] !== `${name}.wasm`
    )
      return;
    if (
      match[4]
        ?.split(".")
        .some(
          (part) =>
            /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"),
        )
    )
      return;
    return { handle, name, version };
  } catch {
    return;
  }
}

async function reportDownload(download: Download, env: Env) {
  if (!env.DOWNLOAD_TRACKING_TOKEN) {
    console.error("Download tracking token is not configured");
    return;
  }
  try {
    const endpoint = new URL(env.DOWNLOAD_API_URL);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password
    )
      throw Error();
  } catch {
    console.error("Download tracking URL is invalid");
    return;
  }
  const body = JSON.stringify({ ...download, eventId: crypto.randomUUID() });
  // Retry once with the same event ID if the API may not have acknowledged a commit.
  for (let attempt = 0; attempt < 2; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 5000);
    try {
      const response = await fetch(env.DOWNLOAD_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.DOWNLOAD_TRACKING_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
        signal: abort.signal,
        redirect: "manual",
      });
      await response.body?.cancel();
      if (response.ok) return;
      if (response.status < 500 && response.status !== 429) {
        console.error("Download tracking rejected", response.status);
        return;
      }
    } catch {
      /* Retry without affecting the download or logging credentials. */
    } finally {
      clearTimeout(timer);
    }
  }
  console.error("Download tracking unavailable after retry");
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Replace only the origin. Preserve the encoded path, query, method, headers,
    // streaming body, redirect policy and other Request properties.
    const upstream = request.url.replace(/^https?:\/\/[^/]+/, origin);
    const response = await fetch(new Request(upstream, request));
    if (request.method === "GET" && response.status === 200) {
      const download = downloadFromPath(new URL(request.url).pathname);
      if (download) ctx.waitUntil(reportDownload(download, env));
    }
    // Return the original response: no buffering, header edits, redirects or cache changes.
    return response;
  },
} satisfies ExportedHandler<Env>;
