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
