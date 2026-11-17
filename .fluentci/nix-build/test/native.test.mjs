import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, command, requireSignatures } from "../run.mjs";

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
        { pollIntervalMs: 10 },
      );
      assert.equal(uploads, 2);
      assert.equal(uploadedMetadata.size, 3, "dependency plus two wrappers");
      await scheduled;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
