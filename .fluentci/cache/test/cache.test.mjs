import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fromAff } from "../output/Control.Promise/index.js";
import * as Generic from "../output/CI.Cache.Generic/index.js";
import * as Connection from "../output/CI.Cache.Connection/index.js";
import * as Sccache from "../output/CI.Cache.Sccache/index.js";
import * as IO from "../src/CI/Cache/IO.js";
const env = {
  FLUENTCI_CACHE_URL:
    "https://cache.fluentci.io/did:plc:abcdefghijklmnopqrstuvwx",
  FLUENTCI_CACHE_TOKEN: "fixture-token",
};
const run = (aff) => fromAff(aff)();
test("URL and environment-only token are mandatory before I/O", async () => {
  await assert.rejects(
    run(Connection.connection({ ...env, FLUENTCI_CACHE_TOKEN: "" })("")),
    /TOKEN/,
  );
  await assert.rejects(
    run(Connection.connection({ ...env, FLUENTCI_CACHE_URL: "" })("")),
    /URL/,
  );
  assert.equal(
    (
      await run(
        Connection.connection(env)(
          "https://cache.fluentci.io/did:web:example.org",
        ),
      )
    ).base,
    "https://cache.fluentci.io/did:web:example.org",
  );
  for (const url of [
    "http://cache.fluentci.io/example.com",
    "https://user:pass@cache.fluentci.io/example.com",
    "https://cache.fluentci.io/example.com/nix",
  ])
    await assert.rejects(run(Connection.connection(env)(url)));
});
test("supported sccache platforms and generic fallback are explicit", () => {
  for (const os of ["linux", "darwin", "win32"])
    for (const arch of ["x64", "arm64"]) assert.ok(Sccache.target(os)(arch));
  for (const os of ["freebsd", "openbsd", "netbsd"])
    assert.equal(Sccache.target(os)("x64"), "");
});
test("generic cache streams files and directories with zstd, gzip and no compression", async (t) => {
  // macOS tmpdir() may start at /var -> /private/var. Keep fixture parents
  // canonical so the restore guard can still reject user-created symlinks.
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "cache-roundtrip-")),
  );
  const previous = globalThis.fetch;
  const objects = new Map();
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.equal(
      options.redirect,
      options.method === "PUT" ? "error" : "manual",
    );
    if (options.method === "PUT") {
      const chunks = [];
      for await (const part of options.body) chunks.push(part);
      objects.set(String(url), Buffer.concat(chunks));
      return new Response(null, { status: 201 });
    }
    return objects.has(String(url))
      ? new Response(objects.get(String(url)))
      : new Response(null, { status: 404 });
  };
  t.after(async () => {
    globalThis.fetch = previous;
    await rm(root, { recursive: true, force: true });
  });
  for (const format of ["zstd", "gzip", "none"]) {
    const source = join(root, "source-" + format);
    await mkdir(source);
    await writeFile(join(source, "payload"), "hello cache");
    const key = "fixtures/" + format;
    await run(Generic.save(env)("")(key)(source)(format));
    const target = join(root, "restored-" + format);
    const result = await run(Generic.restore(env)("")(key)(target)(false));
    assert.equal(result.hit, true);
    assert.equal(
      await readFile(join(target, "payload"), "utf8"),
      "hello cache",
    );
    const file = join(root, "file-" + format);
    await writeFile(file, "plain");
    await run(Generic.save(env)("")(key + "-file")(file)(format));
    const fileOut = join(root, "output-" + format);
    await run(Generic.restore(env)("")(key + "-file")(fileOut)(true));
    assert.equal(await readFile(fileOut, "utf8"), "plain");
  }
  const existing = join(root, "existing");
  await writeFile(existing, "preserve");
  assert.equal(
    (await run(Generic.restore(env)("")("missing")(existing)(false))).hit,
    false,
  );
  await assert.rejects(
    run(Generic.restore(env)("")("missing")(existing)(true)),
    /not found/,
  );
  const key = "fixtures/zstd-file",
    url = env.FLUENTCI_CACHE_URL + "/generic/" + key;
  const corrupt = Buffer.from(objects.get(url));
  corrupt[corrupt.length - 1] ^= 1;
  objects.set(url, corrupt);
  await assert.rejects(
    run(Generic.restore(env)("")(key)(existing)(false)),
    /checksum/,
  );
  assert.equal(await readFile(existing, "utf8"), "preserve");
  await assert.rejects(
    run(Generic.save(env)("")("../escape")(existing)("zstd")),
    /key/,
  );
  const unsafe = join(root, "unsafe");
  await mkdir(unsafe);
  await symlink(existing, join(unsafe, "link"));
  await assert.rejects(IO.pack(unsafe)("gzip")(), /symbolic/);
  const parent = join(root, "restore-parent");
  const linkedParent = join(root, "linked-parent");
  await mkdir(parent);
  await symlink(parent, linkedParent, "dir");
  await assert.rejects(
    run(
      Generic.restore(env)("")("fixtures/gzip-file")(
        join(linkedParent, "restored"),
      )(true),
    ),
    /parents cannot be symlinks/,
  );
});

// Run the real host boundary without invoking FluentCI or installing sccache.
// The engine streams host stdout before emitting the module's public result.
test("internal setup output cannot be mistaken for the public environment result", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cache-host-result-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "config");
  const host = new URL("../host.mjs", import.meta.url).href;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(host)})`,
      "setup",
      JSON.stringify({ protocol: "generic", configDir: directory }),
    ],
    { env: { ...process.env, ...env } },
  );
  const lines = stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.environment, undefined);
  assert.equal(envelope.binDir, undefined);
  assert.equal(envelope.cacheHostResult.protocol, "generic");
  assert.equal(envelope.cacheHostResult.binDir, directory);
  assert.ok(
    envelope.cacheHostResult.environment.some(
      (item) => item.name === "FLUENTCI_GENERIC_CACHE_URL",
    ),
  );
  assert.ok(!stdout.includes(env.FLUENTCI_CACHE_TOKEN));
});

test("sccache endpoint joins rooted probe and artifact paths without empty key segments", () => {
  const settings = Object.fromEntries(
    Sccache.environment(env.FLUENTCI_CACHE_URL)("/tools/sccache").map(
      ({ name, value }) => [name, value],
    ),
  );
  const endpoint = settings.SCCACHE_WEBDAV_ENDPOINT;
  assert.equal(endpoint, env.FLUENTCI_CACHE_URL + "/sccache");
  for (const key of [".sccache_check", "a/b/c/compiler-cache-key"]) {
    // OpenDAL concatenates the endpoint with its rooted key prefix and path.
    const url = new URL(
      endpoint + "/" + settings.SCCACHE_WEBDAV_KEY_PREFIX + key,
    );
    assert.equal(
      url.pathname,
      "/did:plc:abcdefghijklmnopqrstuvwx/sccache/fluentci/" + key,
    );
    assert.ok(
      url.pathname
        .split("/")
        .slice(1)
        .every((part) => part.length > 0),
    );
  }
  assert.equal(settings.SCCACHE_WEBDAV_DISABLE_CREATE_DIR, "true");
  assert.equal(settings.RUSTC_WRAPPER, "/tools/sccache");
});

test("handle and legacy URL inputs generate owner DID URLs", async (t) => {
  const previous = globalThis.fetch;
  const owner = "did:plc:abcdefghijklmnopqrstuvwx";
  globalThis.fetch = async (url) => {
    assert.equal(
      new URL(url).pathname,
      "/xrpc/io.fluentci.cache.resolveAccount",
    );
    return Response.json({ owner, cacheId: "a".repeat(64) });
  };
  t.after(() => {
    globalThis.fetch = previous;
  });
  for (const actor of [
    "owner.test",
    "@owner.test",
    "accounts/" + "a".repeat(64),
  ]) {
    const connection = await run(
      Connection.connection(env)("https://cache.fluentci.io/" + actor),
    );
    assert.equal(connection.actor, owner);
    assert.equal(connection.base, "https://cache.fluentci.io/" + owner);
  }
  assert.equal(IO.registryAccount(owner), "did-plc-abcdefghijklmnopqrstuvwx");
  assert.equal(
    IO.registryAccount("did:web:example.com"),
    "did-web-" + Buffer.from("example.com").toString("hex"),
  );
});

test("generic restore follows CDN redirects without forwarding upload tokens", async (t) => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "manual");
    if (calls.length === 1)
      return new Response(null, {
        status: 307,
        headers: { location: "https://cache-cdn.fluentci.io/object?v=1" },
      });
    assert.equal(options.headers.Authorization, undefined);
    return new Response("payload");
  };
  t.after(() => {
    globalThis.fetch = previous;
  });
  const result = await IO.download(env.FLUENTCI_CACHE_URL + "/generic/key")(
    "fixture-token",
  )();
  t.after(() => rm(result.directory, { recursive: true, force: true }));
  assert.equal(calls[0].options.headers.Authorization, "Bearer fixture-token");
  assert.equal(calls[1].url, "https://cache-cdn.fluentci.io/object?v=1");
  assert.equal(await readFile(result.file, "utf8"), "payload");
});
test("generic restore rejects unsafe redirects and bounds redirect loops", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  for (const location of [
    "http://cdn.example/key",
    "https://user:password@cdn.example/key",
  ]) {
    globalThis.fetch = async () =>
      new Response(null, { status: 307, headers: { location } });
    await assert.rejects(
      IO.download(env.FLUENTCI_CACHE_URL + "/generic/key")("fixture-token")(),
      /HTTPS without credentials/,
    );
  }
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(null, { status: 307, headers: { location: "/loop" } });
  };
  await assert.rejects(
    IO.download(env.FLUENTCI_CACHE_URL + "/generic/key")("fixture-token")(),
    /too many redirects/,
  );
  assert.equal(requests, 6);
});
