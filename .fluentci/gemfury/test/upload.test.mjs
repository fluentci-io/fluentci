import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function workspace(target, version = "v0.17.0") {
  const root = mkdtempSync(join(tmpdir(), "fluentci-gemfury-"));
  const scripts = join(root, ".github/scripts");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "target/release-assets"), { recursive: true });
  for (const name of [
    "linux-package-env.sh",
    "upload-gemfury.sh",
    "package-linux-release.sh",
  ]) {
    copyFileSync(
      fileURLToPath(
        new URL(`../../../.github/scripts/${name}`, import.meta.url),
      ),
      join(scripts, name),
    );
  }
  const log = join(root, "curl.jsonl");
  writeFileSync(
    join(root, "bin/curl"),
    `#!/usr/bin/env node
require("node:fs").appendFileSync(process.env.CURL_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
process.exit(process.env.FAIL_UPLOAD ? 22 : 0);
`,
    { mode: 0o755 },
  );
  return {
    root,
    log,
    run: (extra = {}, script = "upload-gemfury.sh") =>
      spawnSync("bash", [`.github/scripts/${script}`], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${root}/bin:${process.env.PATH}`,
          TARGET: target,
          RELEASE_VERSION: version,
          FURY_TOKEN: "test-secret-never-in-argv",
          FURY_USER: "publisher",
          FURY_ACCOUNT: "fluentci",
          CURL_LOG: log,
          ...extra,
        },
      }),
  };
}

test("uploads exactly the current release's Debian and RPM files for each architecture", () => {
  for (const [target, debArch, rpmArch] of [
    ["x86_64-unknown-linux-gnu", "amd64", "x86_64"],
    ["aarch64-unknown-linux-gnu", "arm64", "aarch64"],
  ]) {
    const f = workspace(target);
    try {
      const files = [
        `fluentci_0.17.0_${debArch}.deb`,
        `fluentci-0.17.0-1.${rpmArch}.rpm`,
      ];
      for (const name of files)
        writeFileSync(
          join(f.root, "target/release-assets", name),
          "package fixture",
        );
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      const calls = readFileSync(f.log, "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.equal(calls.length, 2);
      for (let i = 0; i < 2; i++) {
        assert.ok(calls[i].includes("%FURY_TOKEN"));
        assert.ok(calls[i].includes("%FURY_USER"));
        assert.ok(calls[i].includes("{{FURY_USER}}:{{FURY_TOKEN}}"));
        assert.ok(calls[i].includes("https://push.fury.io/fluentci/"));
        assert.ok(calls[i].some((arg) => arg.endsWith(`${files[i]}"`)));
      }
      assert.ok(
        !JSON.stringify([calls, result.stdout, result.stderr]).includes(
          "test-secret-never-in-argv",
        ),
      );
      assert.equal(f.run({ FAIL_UPLOAD: "1" }).status, 22);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("missing packages, unsafe accounts, invalid versions and unsupported targets never upload", () => {
  const f = workspace("x86_64-unknown-linux-gnu");
  try {
    for (const env of [
      {},
      { FURY_ACCOUNT: "../other" },
      { FURY_USER: "" },
      { FURY_USER: "user:password" },
      { RELEASE_VERSION: "v1;false" },
      { TARGET: "aarch64-apple-darwin" },
    ]) {
      assert.notEqual(f.run(env).status, 0);
      assert.equal(existsSync(f.log), false);
    }
    writeFileSync(
      join(f.root, "target/release-assets/fluentci_0.17.0_amd64.deb"),
      "fixture",
    );
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(f.log), false);
    assert.notEqual(
      f.run({ RELEASE_VERSION: "../escape" }, "package-linux-release.sh")
        .status,
      0,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
