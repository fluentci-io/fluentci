import test from "node:test";
import assert from "node:assert/strict";
import worker, { downloadFromPath } from "../src/index.ts";

const env = {
  DOWNLOAD_API_URL:
    "https://api.fluentci.io/xrpc/io.fluentci.registry.recordDownload",
  DOWNLOAD_TRACKING_TOKEN: "private-worker-token-with-at-least-32-characters",
};
const url =
  "https://modules.fluentci.io/@alice.example/sccache/v0.1.0/sccache.wasm?download=1";
function context() {
  const pending = [];
  return { pending, waitUntil: (promise) => pending.push(promise) };
}

test("streams the original response without waiting for authenticated counter reporting", async (t) => {
  let acknowledge;
  const blocked = new Promise((resolve) => {
    acknowledge = resolve;
  });
  const requests = [];
  const upstream = new Response(new Uint8Array([0, 97, 115, 109]), {
    headers: {
      "Content-Type": "application/wasm",
      ETag: '"wasm"',
      "Cache-Control": "public,max-age=300",
    },
  });
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    return request.url.startsWith("https://mod.fluentci.io")
      ? upstream
      : blocked;
  });
  const ctx = context();
  const original = new Request(url, {
    headers: { "X-Custom": "preserved", Authorization: "Bearer client-token" },
    redirect: "manual",
  });
  const response = await worker.fetch(original, env, ctx);
  assert.equal(response, upstream);
  assert.equal(response.bodyUsed, false);
  assert.equal(
    requests[0].url,
    url.replace("modules.fluentci.io", "mod.fluentci.io"),
  );
  assert.equal(requests[0].headers.get("X-Custom"), "preserved");
  assert.equal(requests[0].headers.get("Authorization"), "Bearer client-token");
  assert.equal(requests[0].redirect, "manual");
  assert.equal(
    requests[1].headers.get("Authorization"),
    `Bearer ${env.DOWNLOAD_TRACKING_TOKEN}`,
  );
  assert.equal(requests[1].redirect, "manual");
  assert.equal(ctx.pending.length, 1);
  const event = await requests[1].json();
  assert.deepEqual(
    { ...event, eventId: "id" },
    {
      handle: "alice.example",
      name: "sccache",
      version: "0.1.0",
      eventId: "id",
    },
  );
  assert.match(event.eventId, /^[\da-f-]{36}$/);
  acknowledge(new Response('{"recorded":1,"downloads":1}'));
  await Promise.all(ctx.pending);
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [0, 97, 115, 109],
  );
});

test("preserves encoded paths, repeated query values, method, headers and request bodies", async (t) => {
  const original = new Request(
    "https://modules.fluentci.io/a%2Fb?x=%2B&x=a+b&x=%252f",
    {
      method: "POST",
      headers: { "X-Test": "original", "Content-Type": "text/plain" },
      body: "unchanged body",
      redirect: "manual",
    },
  );
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.equal(
      request.url,
      "https://mod.fluentci.io/a%2Fb?x=%2B&x=a+b&x=%252f",
    );
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("X-Test"), "original");
    assert.equal(await request.text(), "unchanged body");
    return new Response("unchanged response", { status: 202 });
  });
  const ctx = context();
  const response = await worker.fetch(original, env, ctx);
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "unchanged response");
  assert.equal(ctx.pending.length, 0);
});

test("HEAD, ranges, redirects, errors and non-module paths never increment counters", async (t) => {
  for (const [method, status, path] of [
    ["HEAD", 200, url],
    ["GET", 206, url],
    ["GET", 304, url],
    ["GET", 404, url],
    ["GET", 500, url],
    ["GET", 200, "https://modules.fluentci.io/README.md"],
  ]) {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(null, { status }),
    );
    const ctx = context();
    assert.equal(
      (await worker.fetch(new Request(path, { method }), env, ctx)).status,
      status,
    );
    assert.equal(ctx.pending.length, 0);
    t.mock.restoreAll();
  }
});

test("counter retries use one event ID and cannot delay or break downloads", async (t) => {
  const events = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    if (input instanceof Request) return new Response("wasm");
    events.push(JSON.parse(init.body));
    if (events.length === 1) throw Error("connection lost after commit");
    return new Response("ok");
  });
  const ctx = context();
  const response = await worker.fetch(new Request(url), env, ctx);
  await Promise.all(ctx.pending);
  assert.equal(await response.text(), "wasm");
  assert.equal(events.length, 2);
  assert.equal(events[0].eventId, events[1].eventId);
});

test("report failures and missing configuration leave upstream responses unchanged", async (t) => {
  t.mock.method(console, "error", () => {});
  const configs = [
    env,
    { ...env, DOWNLOAD_TRACKING_TOKEN: undefined },
    { ...env, DOWNLOAD_API_URL: "http://untrusted.example" },
  ];
  for (const config of configs) {
    const response = new Response("wasm");
    t.mock.method(globalThis, "fetch", async (input) =>
      input instanceof Request ? response : new Response(null, { status: 401 }),
    );
    const ctx = context();
    assert.equal(await worker.fetch(new Request(url), config, ctx), response);
    await Promise.all(ctx.pending);
  }
});

test("parses versioned module paths only for analytics without changing their encoding", () => {
  assert.deepEqual(
    downloadFromPath("/%40alice.example/sccache/v0.1.0/sccache.wasm"),
    { handle: "alice.example", name: "sccache", version: "0.1.0" },
  );
  assert.equal(
    downloadFromPath("/@alice.example/cache/v1.0.0-01/cache.wasm"),
    undefined,
  );
  assert.equal(
    downloadFromPath("/@alice.example/cache/v01.0.0/cache.wasm"),
    undefined,
  );
  assert.equal(
    downloadFromPath("/@alice.example/cache/v1.0.0/other.wasm"),
    undefined,
  );
  assert.equal(
    downloadFromPath("/@alice.example/cache%2Fescape/v1.0.0/cache.wasm"),
    undefined,
  );
  assert.equal(downloadFromPath("/%ZZ/cache/v1.0.0/cache.wasm"), undefined);
});
