import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  symlink,
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
  FLUENTCI_CACHE_URL: "https://cache.fluentci.io/@example.com",
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
        Connection.connection(env)("https://cache.fluentci.io/example.org"),
      )
    ).base,
    "https://cache.fluentci.io/example.org",
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
  const root = await mkdtemp(join(tmpdir(), "cache-roundtrip-"));
  const previous = globalThis.fetch;
  const objects = new Map();
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.equal(options.redirect, "error");
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
});

// Run the real host boundary without invoking FluentCI or installing sccache.
// The engine streams host stdout before emitting the module's public result.
test("internal setup output cannot be mistaken for the public environment result", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cache-host-result-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "config");
  const host = new URL("../host.mjs", import.meta.url).href;
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--input-type=module", "--eval", `await import(${JSON.stringify(host)})`,
    "setup", JSON.stringify({ protocol: "generic", configDir: directory }),
  ], { env: { ...process.env, ...env } });
  const lines = stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.environment, undefined);
  assert.equal(envelope.binDir, undefined);
  assert.equal(envelope.cacheHostResult.protocol, "generic");
  assert.equal(envelope.cacheHostResult.binDir, directory);
  assert.ok(envelope.cacheHostResult.environment.some(
    (item) => item.name === "FLUENTCI_GENERIC_CACHE_URL",
  ));
  assert.ok(!stdout.includes(env.FLUENTCI_CACHE_TOKEN));
});

test("sccache endpoint joins rooted probe and artifact paths without empty key segments", () => {
  const settings = Object.fromEntries(Sccache.environment(env.FLUENTCI_CACHE_URL)("/tools/sccache")
    .map(({ name, value }) => [name, value]));
  const endpoint = settings.SCCACHE_WEBDAV_ENDPOINT;
  assert.equal(endpoint, env.FLUENTCI_CACHE_URL + "/sccache");
  for (const key of [".sccache_check", "a/b/c/compiler-cache-key"]) {
    // OpenDAL concatenates the endpoint with its rooted key prefix and path.
    const url = new URL(endpoint + "/" + settings.SCCACHE_WEBDAV_KEY_PREFIX + key);
    assert.equal(url.pathname, "/@example.com/sccache/fluentci/" + key);
    assert.ok(url.pathname.split("/").slice(1).every((part) => part.length > 0));
  }
  assert.equal(settings.SCCACHE_WEBDAV_DISABLE_CREATE_DIR, "true");
  assert.equal(settings.RUSTC_WRAPPER, "/tools/sccache");
});
