import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export function pwa(): Plugin {
  return {
    name: "fluentci-pwa",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const assets = [
        "/index.html",
        "/favicon.png",
        "/pwa-192.png",
        "/pwa-512.png",
        "/fluentci-logo.png",
        ...Object.keys(bundle)
          .filter((path) => path.startsWith("assets/"))
          .map((path) => `/${path}`),
      ];
      const version = createHash("sha256")
        .update(JSON.stringify(assets))
        .digest("hex")
        .slice(0, 16);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE = "fluentci-shell-${version}";
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("fluentci-shell-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Never inspect or cache credentials, OAuth responses, XRPC, or remote APIs.
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("authorization") || url.pathname.startsWith("/oauth") || url.pathname.startsWith("/xrpc") || url.searchParams.has("code") || url.searchParams.has("state")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then((cache) => cache.match("/index.html"))));
  } else if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request, { ignoreVary: true })) || fetch(request)));
  }
});
`,
      });
    },
  };
}
