import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectLinuxLibc, ensureBinary, extractArchive, releaseTag, targetFor } from "../lib/install.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "fluentci-npm-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = Buffer.from("fixture archive");
  const digest = createHash("sha256").update(archive).digest("hex");
  const requests = [];
  return {
    root,
    requests,
    options: {
      cacheRoot: root,
      version: "0.17.3",
      platform: "linux",
      architecture: "x64",
      libc: "gnu",
      log: () => {},
      fetchImpl: async (url) => {
        requests.push(url);
        return new Response(url.endsWith(".sha256") ? `${digest}  release.tar.gz\n` : archive);
      },
      extract: async (_archive, directory) => writeFile(join(directory, "fluentci"), "fixture executable"),
    },
  };
}

test("selects every published platform and rejects unsupported combinations", () => {
  for (const [platform, architecture, target] of [
    ["linux", "x64", "x86_64-unknown-linux-gnu"],
    ["linux", "arm64", "aarch64-unknown-linux-gnu"],
    ["darwin", "x64", "x86_64-apple-darwin"],
    ["darwin", "arm64", "aarch64-apple-darwin"],
    ["freebsd", "x64", "x86_64-unknown-freebsd"],
    ["netbsd", "x64", "x86_64-unknown-netbsd"],
    ["openbsd", "x64", "x86_64-unknown-openbsd"],
  ]) assert.equal(targetFor(platform, architecture), target);
  for (const [platform, architecture] of [["win32", "x64"], ["linux", "ia32"], ["openbsd", "arm64"]]) {
    assert.throws(() => targetFor(platform, architecture), /No FluentCI release binary/);
  }
  assert.equal(releaseTag("0.17.3"), "v0.17.3");
  assert.equal(releaseTag("v0.17.3"), "v0.17.3");
  assert.equal(releaseTag("latest"), "latest");
  for (const version of ["../escape", "v0.17.3/path", "", "--help"]) assert.throws(() => releaseTag(version));
});

test("verifies downloads, atomically installs, and reuses the cached executable", async (t) => {
  const f = await fixture(t);
  const binary = await ensureBinary(f.options);
  assert.equal(await readFile(binary, "utf8"), "fixture executable");
  assert.ok(f.requests.every((url) => url.startsWith("https://github.com/fluentci-io/fluentci/releases/download/v0.17.3/")));
  assert.equal(f.requests.length, 2);
  assert.equal(await ensureBinary({ ...f.options, fetchImpl: () => assert.fail("Cache hit must not request the network") }), binary);
  assert.deepEqual(await readdir(join(f.root, "v0.17.3", "x86_64-unknown-linux-gnu")), ["fluentci"]);
});

test("corrupt downloads never extract or install, and staging is removed", async (t) => {
  const f = await fixture(t);
  await assert.rejects(ensureBinary({
    ...f.options,
    fetchImpl: async (url) => new Response(url.endsWith(".sha256") ? "0".repeat(64) : "wrong bytes"),
    extract: () => assert.fail("Unverified bytes must not be extracted"),
  }), /checksum mismatch/);
  assert.deepEqual(await readdir(join(f.root, "v0.17.3", "x86_64-unknown-linux-gnu")), []);
});

test("concurrent installs share the final path without persistent guard files", async (t) => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([ensureBinary(f.options), ensureBinary(f.options)]);
  assert.equal(first, second);
  assert.equal(await readFile(first, "utf8"), "fixture executable");
  assert.deepEqual(await readdir(join(f.root, "v0.17.3", "x86_64-unknown-linux-gnu")), ["fluentci"]);
});

test("missing releases fail without retries or leftover staging", async (t) => {
  const f = await fixture(t);
  let attempts = 0;
  await assert.rejects(ensureBinary({ ...f.options, fetchImpl: async () => { attempts += 1; return new Response("missing", { status: 404 }); } }), /HTTP 404/);
  assert.equal(attempts, 1);
  assert.deepEqual(await readdir(join(f.root, "v0.17.3", "x86_64-unknown-linux-gnu")), []);
});

test("extracted symbolic links are rejected without modifying their target", async (t) => {
  const f = await fixture(t);
  const outside = join(f.root, "outside");
  await writeFile(outside, "untouched");
  await assert.rejects(ensureBinary({ ...f.options, extract: async (_archive, directory) => symlink(outside, join(directory, "fluentci")) }), /regular, nonempty/);
  assert.equal(await readFile(outside, "utf8"), "untouched");
});

test("latest resolves through the release redirect and caches under its actual tag", async (t) => {
  const f = await fixture(t);
  const binary = await ensureBinary({
    ...f.options,
    version: "latest",
    fetchImpl: async (url, options) => {
      if (url.endsWith("/latest")) {
        assert.equal(options.method, "HEAD");
        return { ok: true, url: "https://github.com/fluentci-io/fluentci/releases/tag/v0.17.3" };
      }
      return f.options.fetchImpl(url, options);
    },
  });
  assert.equal(binary, join(f.root, "v0.17.3", "x86_64-unknown-linux-gnu", "fluentci"));
});

test("real archives extract only the executable", async (t) => {
  const f = await fixture(t);
  const source = join(f.root, "source");
  const destination = join(f.root, "destination");
  await mkdir(source);
  await mkdir(destination);
  await writeFile(join(source, "fluentci"), "fixture executable");
  await writeFile(join(source, "README.md"), "not extracted");
  const archive = join(f.root, "fixture.tar.gz");
  const result = spawnSync("tar", ["-czf", archive, "-C", source, "fluentci", "README.md"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  await extractArchive(archive, destination);
  assert.deepEqual(await readdir(destination), ["fluentci"]);
});

test("wrapper preserves literal arguments and the child exit code without downloading", async (t) => {
  const f = await fixture(t);
  const directory = join(f.root, "v0.17.3", targetFor(process.platform, process.arch));
  await mkdir(directory, { recursive: true });
  // This is a tiny synthetic fixture, not a FluentCI binary.
  await writeFile(join(directory, "fluentci"), '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2))); process.exitCode = 19;\n', { mode: 0o755 });
  const args = ["run", "demo", "--src", "a path with spaces", "$(literal)"];
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../bin/fluentci.mjs", import.meta.url)), ...args], {
    env: { ...process.env, FLUENTCI_CACHE_DIR: f.root, FLUENTCI_VERSION: "0.17.3", FLUENTCI_LIBC: "gnu" }, encoding: "utf8",
  });
  assert.equal(result.status, 19, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
});

test("detects libc and selects separate musl release/cache identities", async (t) => {
  assert.equal(detectLinuxLibc({header:{glibcVersionRuntime:"2.39"}}), "gnu");
  assert.equal(detectLinuxLibc({header:{}}), "musl");
  for (const [arch, target] of [["x64","x86_64"],["arm64","aarch64"]]) {
    assert.equal(targetFor("linux", arch, "musl"), target+"-unknown-linux-musl");
  }
  assert.throws(() => targetFor("linux","x64","invalid"), /FLUENTCI_LIBC/);
  const f = await fixture(t);
  const binary = await ensureBinary({...f.options, libc:"musl"});
  assert.ok(binary.endsWith("x86_64-unknown-linux-musl/fluentci"));
  assert.ok(f.requests.every(url => url.includes("x86_64-unknown-linux-musl.tar.gz")));
});
