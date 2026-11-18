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
import {
  build,
  configuration,
  uploadFiles,
  uploadFile,
  requireSignatures,
} from "../run.mjs";

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
  assert.match(config.nixEnv.NIX_CONFIG, /http-connections = 16/);
  assert.match(config.nixEnv.NIX_CONFIG, /extra-substituters = https:.*\/nix/);
  assert.match(
    config.nixEnv.NIX_CONFIG,
    /extra-trusted-public-keys = fluentci-1:/,
  );
  assert.equal(config.nixEnv.FLUENTCI_CACHE_TOKEN, undefined);
  assert.equal(config.nixEnv.FLUENTCI_NIX_SIGNING_KEY, undefined);
});

test("transient upload failures retry with complete fresh streams and bounded backoff", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fluentci-upload-retry-"));
  try {
    const file = join(directory, "payload.nar.xz");
    await writeFile(file, "complete payload");
    const bodies = [];
    const waits = [];
    let attempts = 0;
    await uploadFile(
      file,
      "https://cache.example/nix/nar/payload",
      "private-token",
      async (_url, options) => {
        let text = "";
        for await (const chunk of options.body) text += chunk;
        bodies.push(text);
        attempts++;
        if (attempts === 1) return new Response(null, { status: 408 });
        if (attempts === 2) throw new TypeError("fetch failed");
        if (attempts === 3)
          return new Response(null, {
            status: 429,
            headers: { "retry-after": "3" },
          });
        return new Response(null, { status: 201 });
      },
      {
        wait: async (ms) => {
          waits.push(ms);
        },
      },
    );
    assert.deepEqual(bodies, Array(4).fill("complete payload"));
    assert.deepEqual(waits, [1000, 2000, 4000]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retry exhaustion fails without publishing narinfo, while authentication failures do not retry", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fluentci-upload-retry-limit-"),
  );
  try {
    await mkdir(join(directory, "nar"));
    await writeFile(join(directory, "nar/payload.nar.xz"), "payload");
    await writeFile(join(directory, "payload.narinfo"), "metadata");
    const requests = [];
    await assert.rejects(
      uploadFiles(
        directory,
        "https://cache.example/nix",
        "private-token",
        async (url, options) => {
          options.body.destroy();
          requests.push(url);
          return new Response(null, { status: 504 });
        },
        undefined,
        { wait: async () => {} },
      ),
      /HTTP 504/,
    );
    assert.equal(requests.length, 4);
    assert.ok(requests.every((url) => url.endsWith(".nar.xz")));
    for (const status of [400, 401, 403, 413]) {
      let attempts = 0;
      await assert.rejects(
        uploadFile(
          join(directory, "nar/payload.nar.xz"),
          "https://cache.example/nix/nar/payload",
          "private-token",
          async (_url, options) => {
            options.body.destroy();
            attempts++;
            return new Response(null, { status });
          },
          {
            wait: async () => assert.fail("must not retry permanent failures"),
          },
        ),
        new RegExp(`HTTP ${status}`),
      );
      assert.equal(attempts, 1);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    if (args.includes("--all")) return "";
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
    if (args[0] === "store") return "";
    const url = new URL(args[args.indexOf("--to") + 1]);
    keyPath = url.searchParams.get("secret-key");
    exportPath = decodeURIComponent(url.pathname);
    assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    assert.equal(
      await readFile(keyPath, "utf8"),
      env.FLUENTCI_NIX_SIGNING_KEY + "\n",
    );
    await writeFile(
      join(exportPath, "test.narinfo"),
      `StorePath: /nix/store/artifact\nSig: fluentci-1:${Buffer.alloc(64).toString("base64")}\n`,
    );
    assert.ok(!args.includes("--no-recursive"));
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

test("failed baseline query never starts the build or upload", async () => {
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

test("watcher publishes during the build, deduplicates paths, and drains after a build failure", async () => {
  let rejectBuild;
  let building = false;
  let scans = 0;
  let exports = 0;
  let uploads = 0;
  let keyPath;
  const run = async (program, args) => {
    if (args.includes("--all")) {
      if (++scans === 1) return "/nix/store/preexisting";
      return "/nix/store/preexisting\n/nix/store/artifact\n/nix/store/source.drv";
    }
    if (args[0] === "build") {
      building = true;
      return new Promise((_, reject) => {
        rejectBuild = reject;
      });
    }
    if (args[0] === "path-info")
      return JSON.stringify([{ path: "/nix/store/artifact", signatures: [] }]);
    if (args[0] === "store") return "";
    assert.equal(args[0], "copy");
    const destination = new URL(args[args.indexOf("--to") + 1]);
    keyPath = destination.searchParams.get("secret-key");
    exports++;
    await writeFile(
      join(decodeURIComponent(destination.pathname), "test.narinfo"),
      `StorePath: /nix/store/artifact\nSig: fluentci-1:${Buffer.alloc(64).toString("base64")}\n`,
    );
  };
  await assert.rejects(
    build(
      env,
      run,
      async () => {
        assert.equal(building, true, "publish before the build settles");
        uploads++;
        rejectBuild(Error("later compilation failed"));
        building = false;
      },
      { pollIntervalMs: 1 },
    ),
    /later compilation failed/,
  );
  assert.equal(uploads, 1);
  assert.equal(exports, 1);
  await assert.rejects(access(keyPath));
});

test("upload failure cancels the running Nix build and cleans its private key", async () => {
  let scans = 0;
  let aborted = false;
  let keyPath;
  const run = async (program, args, _env, _capture, signal) => {
    if (args.includes("--all"))
      return ++scans === 1 ? "" : "/nix/store/artifact";
    if (args[0] === "build")
      return new Promise((_, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(Error("aborted"));
          },
          { once: true },
        );
      });
    if (args[0] === "path-info")
      return JSON.stringify([{ path: "/nix/store/artifact", signatures: [] }]);
    if (args[0] === "store") return "";
    const destination = new URL(args[args.indexOf("--to") + 1]);
    keyPath = destination.searchParams.get("secret-key");
    await writeFile(
      join(decodeURIComponent(destination.pathname), "test.narinfo"),
      `StorePath: /nix/store/artifact\nSig: fluentci-1:${Buffer.alloc(64).toString("base64")}\n`,
    );
  };
  await assert.rejects(
    build(
      env,
      run,
      async () => {
        throw Error("HTTP 401");
      },
      { pollIntervalMs: 1 },
    ),
    /HTTP 401/,
  );
  assert.equal(aborted, true);
  await assert.rejects(access(keyPath));
});

test("publisher rejects unsigned metadata before any upload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fluentci-signature-test-"));
  try {
    await writeFile(
      join(directory, "test.narinfo"),
      "StorePath: /nix/store/test\n",
    );
    await assert.rejects(
      requireSignatures(directory, env.FLUENTCI_NIX_PUBLIC_KEY),
      /Refusing unsigned/,
    );
    await writeFile(
      join(directory, "test.narinfo"),
      `Sig: other-key:${Buffer.alloc(64).toString("base64")}\n`,
    );
    await assert.rejects(
      requireSignatures(directory, env.FLUENTCI_NIX_PUBLIC_KEY),
      /Refusing unsigned/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
