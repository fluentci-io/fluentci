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

// Recognize both public URL spellings and their existing storage identity.
export function downloadFromPath(path: string): Download | undefined {
  try {
    const segments = path.split("/").map(decodeURIComponent);
    if (segments.length !== 5 || segments[0] !== "") return;
    const handle = segments[1].replace(/^@/, "");
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
      if (response.ok) {
        console.info("Download recorded");
        return;
      }
      if (response.status < 500 && response.status !== 429) {
        console.error(
          "Download tracking rejected",
          response.status,
          response.headers.get("location"),
        );
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
    // Preserve the request apart from the origin and the optional @handle alias.
    // The remaining encoded path, query, headers, and streaming body stay intact.
    const path = new URL(request.url).pathname;
    const download = downloadFromPath(path);
    let upstream = request.url.replace(/^https?:\/\/[^/]+/, origin);
    // Canonical public URLs omit @; storage keeps its existing @handle keys.
    if (download && !decodeURIComponent(path.split("/")[1]).startsWith("@"))
      upstream = upstream.replace(`${origin}/`, `${origin}/@`);
    let response = await fetch(
      new Request(upstream, request),
      download ? { cf: { cacheTtlByStatus: { "400-599": -1 } } } : undefined,
    );
    // Recover old negative cache entries created before a release was uploaded.
    // Keep the exact storage URL and retry only safe, bodyless requests once.
    if (
      download &&
      response.status === 404 &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      await response.body?.cancel();
      response = await fetch(new Request(upstream, request), {
        cache: "no-store",
      });
    }
    if (download && response.status >= 400) {
      response = new Response(response.body, response);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("CDN-Cache-Control", "no-store");
      response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    }
    if (request.method === "GET" && response.status === 200 && download) {
      ctx.waitUntil(reportDownload(download, env));
    }
    // Successful responses retain their original streaming body and cache policy.
    return response;
  },
} satisfies ExportedHandler<Env>;
