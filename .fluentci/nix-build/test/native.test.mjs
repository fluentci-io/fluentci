import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  build,
  command,
  configuration,
  requireSignatures,
} from "../dist/nix-cache-host.mjs";

test(
  "native watcher exports referenced paths recursively and reuses metadata after deleting payloads",
  {
    skip: process.env.FLUENTCI_TEST_NIX !== "1",
    timeout: 30_000,
  },
  async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "fluentci-cache-references-")),
    );
    const store = `local?root=${root}/store`;
    const env = {
      ...process.env,
      NIX_CONFIG: "experimental-features = nix-command flakes\nsubstituters =",
    };
    const nix = (args) =>
      command("nix", ["--store", store, ...args], env, true);
    let uploads = 0;
    let finishBuild;
    let secondPath;
    let scheduled;
    try {
      await command(
        "nix-store",
        [
          "--generate-binary-cache-key",
          "native-test",
          `${root}/private.key`,
          `${root}/public.key`,
        ],
        env,
      );
      const publicKey = (await readFile(`${root}/public.key`, "utf8")).trim();
      await nix([
        "eval",
        "--raw",
        "--expr",
        'builtins.toFile "baseline" "existing"',
      ]);
      const firstExpression =
        'let dependency = builtins.toFile "dependency" "shared library"; in builtins.toFile "wrapper" "uses ${dependency}"';
      const run = async (program, args, childEnv, capture, signal) => {
        if (args[0] === "build")
          return new Promise((resolve, reject) => {
            finishBuild = resolve;
            signal.addEventListener(
              "abort",
              () => reject(Error("build aborted")),
              { once: true },
            );
            scheduled = nix(["eval", "--raw", "--expr", firstExpression]).catch(
              reject,
            );
          });
        return command(
          program,
          args.includes("--store") ? args : ["--store", store, ...args],
          childEnv,
          capture,
          signal,
        );
      };
      const uploadedMetadata = new Set();
      const remoteMetadata = new Map();
      await build(
        {
          ...env,
          RUNNER_TEMP: root,
          FLUENTCI_CACHE_URL: `https://cache.fluentci.io/accounts/${"a".repeat(64)}`,
          FLUENTCI_NIX_PUBLIC_KEY: publicKey,
          FLUENTCI_NIX_SIGNING_KEY: await readFile(
            `${root}/private.key`,
            "utf8",
          ),
          FLUENTCI_CACHE_TOKEN: "test-token",
        },
        run,
        async (directory, _cache, _token, _fetcher, metadataFiles) => {
          uploads++;
          await requireSignatures(directory, publicKey);
          assert.ok((await readdir(join(directory, "nar"))).length > 0);
          for (const file of metadataFiles) {
            assert.ok(
              !uploadedMetadata.has(file),
              "metadata uploaded once per path",
            );
            uploadedMetadata.add(file);
            remoteMetadata.set(
              file,
              await readFile(join(directory, file), "utf8"),
            );
          }
          if (uploads === 1) {
            // A later package references the same dependency; its old NAR payloads
            // will have been removed, but their metadata must remain valid locally.
            secondPath = (
              await nix([
                "eval",
                "--raw",
                "--expr",
                `let previous = (${firstExpression}); in builtins.toFile "later-wrapper" "uses ${"${previous}"}"`,
              ])
            ).trim();
          } else {
            finishBuild(JSON.stringify([{ outputs: { out: secondPath } }]));
          }
        },
        { pollIntervalMs: 10, lookup: async () => [] },
      );
      assert.equal(uploads, 2);
      assert.equal(uploadedMetadata.size, 3, "dependency plus two wrappers");
      await scheduled;
      let exports = 0;
      await build(
        {
          ...env,
          RUNNER_TEMP: root,
          FLUENTCI_CACHE_URL: `https://cache.fluentci.io/accounts/${"a".repeat(64)}`,
          FLUENTCI_NIX_PUBLIC_KEY: publicKey,
          FLUENTCI_NIX_SIGNING_KEY: await readFile(
            `${root}/private.key`,
            "utf8",
          ),
          FLUENTCI_CACHE_TOKEN: "test-token",
        },
        async (program, args, childEnv, capture, signal) => {
          if (args[0] === "build")
            return JSON.stringify([{ outputs: { out: secondPath } }]);
          if (args[0] === "copy") exports++;
          return command(
            program,
            args.includes("--store") ? args : ["--store", store, ...args],
            childEnv,
            capture,
            signal,
          );
        },
        async () =>
          assert.fail("already uploaded artifacts must not be uploaded again"),
        {
          pollIntervalMs: 10,
          fetcher: async (url) => {
            if (url.startsWith("https://cache.nixos.org/"))
              return new Response(null, { status: 404 });
            const metadata = remoteMetadata.get(url.split("/").at(-1));
            return metadata
              ? new Response(metadata)
              : new Response(null, { status: 404 });
          },
        },
      );
      assert.equal(
        exports,
        0,
        "warm cache avoids recompressing existing artifacts",
      );
      const thirdPath = (
        await nix([
          "eval",
          "--raw",
          "--expr",
          `let previous = (let previous = (${firstExpression}); in builtins.toFile "later-wrapper" "uses ${"${previous}"}"); in builtins.toFile "new-wrapper" "uses ${"${previous}"}"`,
        ])
      ).trim();
      let newUploads = 0;
      await build(
        {
          ...env,
          RUNNER_TEMP: root,
          FLUENTCI_CACHE_URL: `https://cache.fluentci.io/accounts/${"a".repeat(64)}`,
          FLUENTCI_NIX_PUBLIC_KEY: publicKey,
          FLUENTCI_NIX_SIGNING_KEY: await readFile(
            `${root}/private.key`,
            "utf8",
          ),
          FLUENTCI_CACHE_TOKEN: "test-token",
        },
        async (program, args, childEnv, capture, signal) => {
          if (args[0] === "build")
            return JSON.stringify([{ outputs: { out: thirdPath } }]);
          return command(
            program,
            args.includes("--store") ? args : ["--store", store, ...args],
            childEnv,
            capture,
            signal,
          );
        },
        async (directory, _cache, _token, _fetcher, metadataFiles) => {
          newUploads++;
          assert.equal(
            metadataFiles.length,
            1,
            "only new wrapper metadata uploaded",
          );
          const text = await readFile(
            join(directory, metadataFiles[0]),
            "utf8",
          );
          assert.match(text, /Compression: zstd/);
          assert.match(text, new RegExp(`StorePath: ${thirdPath}`));
          assert.equal(
            (await readdir(join(directory, "nar"))).length,
            1,
            "cached references must not be recompressed",
          );
        },
        {
          pollIntervalMs: 10,
          fetcher: async (url) => {
            const metadata = url.startsWith("https://cache.nixos.org/")
              ? undefined
              : remoteMetadata.get(url.split("/").at(-1));
            return metadata
              ? new Response(metadata)
              : new Response(null, { status: 404 });
          },
        },
      );
      assert.equal(newUploads, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "exact cached derivations restore even when substitution is disabled by the derivation",
  { skip: process.env.FLUENTCI_TEST_NIX !== "1", timeout: 30000 },
  async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "fluentci-substitute-")),
    );
    const env = {
      ...process.env,
      NIX_CONFIG: "experimental-features = nix-command flakes\nsubstituters =",
    };
    try {
      const source = `local?root=${root}/source`,
        target = `local?root=${root}/target`;
      const content = "exact cached result\n";
      await writeFile(`${root}/cached`, content);
      const output = (
        await command(
          "nix-store",
          ["--store", source, "--add-fixed", "sha256", `${root}/cached`],
          env,
          true,
        )
      ).trim();
      await command(
        "nix-store",
        [
          "--generate-binary-cache-key",
          "test",
          `${root}/private`,
          `${root}/public`,
        ],
        env,
        true,
      );
      const publicKey = (await readFile(`${root}/public`, "utf8")).trim();
      await command(
        "nix",
        [
          "--store",
          source,
          "copy",
          "--to",
          `file://${root}/binary?secret-key=${root}/private`,
          output,
        ],
        env,
        true,
      );
      const system = (
        await command(
          "nix",
          ["eval", "--raw", "--impure", "--expr", "builtins.currentSystem"],
          env,
          true,
        )
      ).trim();
      const expr = `builtins.derivation { name = "cached"; system = "${system}"; builder = "/nonexistent-builder"; allowSubstitutes = false; outputHashMode = "flat"; outputHashAlgo = "sha256"; outputHash = "${createHash("sha256").update(content).digest("hex")}"; }`;
      const args = [
        "--store",
        target,
        "build",
        "--no-link",
        "--json",
        "--max-jobs",
        "0",
        "--expr",
        expr,
      ];
      const options = configuration({
        ...env,
        FLUENTCI_CACHE_URL: "https://cache.fluentci.io/@example.com",
        FLUENTCI_NIX_PUBLIC_KEY: publicKey,
      }).nixEnv;
      options.NIX_CONFIG = options.NIX_CONFIG.replace(
        /extra-substituters = .*/,
        `extra-substituters = file://${root}/binary`,
      );
      let failed = false;
      try {
        await command(
          "nix",
          args,
          {
            ...options,
            NIX_CONFIG: options.NIX_CONFIG.replace(
              "always-allow-substitutes = true",
              "always-allow-substitutes = false",
            ),
          },
          true,
        );
      } catch {
        failed = true;
      }
      if (!failed)
        throw Error("Expected disabled substitution to require a build");
      const result = JSON.parse(await command("nix", args, options, true));
      if (result[0].outputs.out !== output) throw Error("Wrong cached output");
      console.log(
        "PASS: exact existing output restored with allowSubstitutes=false and an unusable builder; no build was possible.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
