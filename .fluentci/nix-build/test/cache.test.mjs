import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, configuration, uploadFiles } from "../run.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
const env = {
  FLUENTCI_CACHE_URL: `https://cache.fluentci.io/accounts/${"a".repeat(64)}`,
  FLUENTCI_NIX_PUBLIC_KEY: `fluentci-1:${pub.toString("base64")}`,
  FLUENTCI_NIX_SIGNING_KEY: `fluentci-1:${Buffer.concat([seed, pub]).toString("base64")}`,
  FLUENTCI_CACHE_TOKEN: "test-private-token",
  NIX_CONFIG: "access-tokens = github.com=test-github-token",
};

test("public cache reads preserve GitHub authentication and do not expose upload credentials", () => {
  const config = configuration(env);
  assert.match(
    config.nixEnv.NIX_CONFIG,
    /access-tokens = github.com=test-github-token/,
  );
  assert.match(config.nixEnv.NIX_CONFIG, /extra-substituters = https:.*\/nix/);
  assert.match(
    config.nixEnv.NIX_CONFIG,
    /extra-trusted-public-keys = fluentci-1:/,
  );
  assert.equal(config.nixEnv.FLUENTCI_CACHE_TOKEN, undefined);
  assert.equal(config.nixEnv.FLUENTCI_NIX_SIGNING_KEY, undefined);
});

test("partial credentials and mismatched signing keys fail before building", () => {
  assert.throws(
    () => configuration({ ...env, FLUENTCI_CACHE_TOKEN: "" }),
    /both/,
  );
  assert.throws(
    () => configuration({ ...env, FLUENTCI_NIX_PUBLIC_KEY: "" }),
    /both/,
  );
  assert.throws(
    () =>
      configuration({
        ...env,
        FLUENTCI_NIX_PUBLIC_KEY: `wrong:${pub.toString("base64")}`,
      }),
    /does not match/,
  );
  for (const url of [
    "http://cache.fluentci.io",
    `${env.FLUENTCI_CACHE_URL}/nix`,
    `${env.FLUENTCI_CACHE_URL}?key=x`,
    "https://user:pass@cache.fluentci.io",
  ]) {
    assert.throws(
      () => configuration({ ...env, FLUENTCI_CACHE_URL: url }),
      /HTTPS account URL/,
    );
  }
});

test("unconfigured and public-only builds skip upload and private-key files", async () => {
  for (const config of [
    {},
    { ...env, FLUENTCI_CACHE_TOKEN: "", FLUENTCI_NIX_SIGNING_KEY: "" },
  ]) {
    const calls = [];
    await build(
      config,
      async (...args) => {
        calls.push(args);
        return "[]";
      },
      () => assert.fail("must not upload"),
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], [
      "build",
      "--no-write-lock-file",
      "--json",
      ".#fluentci",
    ]);
  }
});

test("exports intermediate unsigned outputs, excludes signed substitutes, and removes private keys", async () => {
  const calls = [];
  let keyPath;
  let exportPath;
  const run = async (program, args, childEnv) => {
    calls.push([program, args]);
    assert.equal(childEnv.FLUENTCI_CACHE_TOKEN, undefined);
    if (args[0] === "build")
      return JSON.stringify([
        {
          drvPath: "/nix/store/root.drv",
          outputs: { out: "/nix/store/final" },
        },
      ]);
    if (program === "nix-store")
      return "/nix/store/root.drv\n/nix/store/final\n/nix/store/cargo-artifacts\n/nix/store/public-dependency\n";
    if (args[0] === "path-info")
      return JSON.stringify({
        "/nix/store/final": { signatures: [] },
        "/nix/store/cargo-artifacts": { signatures: [] },
        "/nix/store/public-dependency": {
          signatures: ["cache.nixos.org-1:signature"],
        },
      });
    const url = new URL(args[args.indexOf("--to") + 1]);
    keyPath = url.searchParams.get("secret-key");
    exportPath = decodeURIComponent(url.pathname);
    assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    assert.equal(
      await readFile(keyPath, "utf8"),
      env.FLUENTCI_NIX_SIGNING_KEY + "\n",
    );
    assert.ok(args.includes("--no-recursive"));
    assert.ok(args.includes("/nix/store/cargo-artifacts"));
    assert.ok(!args.includes("/nix/store/public-dependency"));
  };
  await build(env, run, async (directory, cache, token) => {
    assert.equal(directory, exportPath);
    assert.equal(cache, `${env.FLUENTCI_CACHE_URL}/nix`);
    assert.equal(token, env.FLUENTCI_CACHE_TOKEN);
    throw Error("upload rejected");
  }).then(
    () => assert.fail("must fail on upload error"),
    (error) => assert.match(error.message, /upload rejected/),
  );
  assert.ok(keyPath);
  await assert.rejects(access(keyPath));
  assert.ok(!JSON.stringify(calls).includes(env.FLUENTCI_CACHE_TOKEN));
  assert.ok(!JSON.stringify(calls).includes(env.FLUENTCI_NIX_SIGNING_KEY));
});

test("failed build never attempts export or upload", async () => {
  let calls = 0;
  await assert.rejects(
    build(
      env,
      async () => {
        calls++;
        throw Error("build failed");
      },
      () => assert.fail(),
    ),
    /build failed/,
  );
  assert.equal(calls, 1);
});

test("uploads payloads before metadata, skips server-managed cache info, and fails on HTTP errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fluentci-upload-test-"));
  try {
    await mkdir(join(directory, "nar"));
    for (const file of ["nar/test.nar.xz", "test.narinfo", "nix-cache-info"])
      await writeFile(join(directory, file), "test");
    const uploaded = [];
    await uploadFiles(
      directory,
      "https://cache.example/nix",
      "token",
      async (url, options) => {
        for await (const _chunk of options.body) {
          /* drain stream */
        }
        assert.equal(options.headers.Authorization, "Bearer token");
        assert.equal(options.headers["Content-Length"], "4");
        assert.equal(options.redirect, "error");
        uploaded.push(url);
        return new Response(null, { status: 200 });
      },
    );
    assert.deepEqual(uploaded, [
      "https://cache.example/nix/nar/test.nar.xz",
      "https://cache.example/nix/test.narinfo",
    ]);
    const failed = [];
    await assert.rejects(
      uploadFiles(
        directory,
        "https://cache.example/nix",
        "token",
        async (url, options) => {
          options.body.destroy();
          failed.push(url);
          return new Response(null, { status: 401 });
        },
      ),
      /HTTP 401/,
    );
    assert.equal(failed.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
