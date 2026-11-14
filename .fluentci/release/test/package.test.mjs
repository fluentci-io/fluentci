import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fixture } from "./host.mjs";

const available =
  process.platform === "linux" &&
  ["dpkg-deb", "rpmbuild", "rpm"].every(
    (tool) => spawnSync("which", [tool]).status === 0,
  );
test(
  "real Debian and RPM packages contain the executable, license, metadata and valid checksums",
  { skip: !available },
  () => {
    const { linuxPackage: buildPackage } = createRequire(import.meta.url)(
      "../dist/plugin.cjs",
    );
    const target =
      process.arch === "arm64"
        ? "aarch64-unknown-linux-gnu"
        : "x86_64-unknown-linux-gnu";
    const debArch = process.arch === "arm64" ? "arm64" : "amd64";
    const rpmArch = process.arch === "arm64" ? "aarch64" : "x86_64";
    const root = mkdtempSync(join(tmpdir(), "fluentci-package-format-"));
    function command(program, args, env = {}) {
      const result = spawnSync(program, args, {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...env },
      });
      assert.equal(
        result.status,
        0,
        `${program}: ${result.stdout}\n${result.stderr}`,
      );
      return result.stdout.trim();
    }
    try {
      mkdirSync(join(root, "target", target, "release"), { recursive: true });
      copyFileSync(
        fileURLToPath(new URL("../../../LICENSE", import.meta.url)),
        join(root, "LICENSE"),
      );
      // Package a native ELF fixture; never launch FluentCI during tests.
      copyFileSync(
        "/bin/true",
        join(root, "target", target, "release/fluentci"),
      );
      for (const version of ["0.17.0", "0.17.1-rc.1"]) {
        fixture(
          {
            TARGET: target,
            RELEASE_VERSION: `v${version}`,
          },
          { root, native: true },
        );
        buildPackage({ target, version: `v${version}` })();
        const dir = join(root, "target/release-assets");
        const deb = join(dir, `fluentci_${version}_${debArch}.deb`);
        const rpm = join(dir, `fluentci-${version}-1.${rpmArch}.rpm`);
        assert.equal(
          command("dpkg-deb", ["--field", deb, "Package"]),
          "fluentci",
        );
        const packageVersion = version.replaceAll("-", "~");
        assert.equal(
          command("dpkg-deb", ["--field", deb, "Version"]),
          packageVersion,
        );
        assert.equal(
          command("rpm", [
            "--query",
            "--package",
            "--queryformat",
            "%{NAME}",
            rpm,
          ]),
          "fluentci",
        );
        assert.equal(
          command("rpm", [
            "--query",
            "--package",
            "--queryformat",
            "%{VERSION}",
            rpm,
          ]),
          packageVersion,
        );
        const listing = command("rpm", ["--query", "--package", "--list", rpm]);
        assert.match(listing, /\/usr\/bin\/fluentci/);
        assert.match(listing, /\/usr\/share\/licenses\/fluentci\/LICENSE/);
        const extracted = join(root, `extracted-${version}`);
        command("dpkg-deb", ["--extract", deb, extracted]);
        assert.deepEqual(
          readFileSync(join(extracted, "usr/bin/fluentci")),
          readFileSync("/bin/true"),
        );
        assert.deepEqual(
          readFileSync(join(extracted, "usr/share/licenses/fluentci/LICENSE")),
          readFileSync(join(root, "LICENSE")),
        );
        for (const path of [deb, rpm]) {
          assert.equal(
            readFileSync(`${path}.sha256`, "utf8").split(" ")[0],
            createHash("sha256").update(readFileSync(path)).digest("hex"),
          );
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
