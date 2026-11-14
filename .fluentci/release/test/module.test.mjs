import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./host.mjs";

const {
  linuxPackageDependencies: dependencies,
  linuxPackage: buildPackage,
  linuxPackagePublish: upload,
  linuxPackageGithub: github,
} = createRequire(import.meta.url)("../dist/plugin.cjs");
const environment = {
  TARGET: "x86_64-unknown-linux-gnu",
  RELEASE_VERSION: "v0.17.0",
  FURY_ACCOUNT: "fluentci",
  FURY_USER: "publisher",
  FURY_TOKEN: "test-only-token",
  GH_TOKEN: "github-test-token",
};

test("PureScript packages both Linux architectures with literal metadata and checksums", () => {
  for (const [TARGET, debArch, rpmArch] of [
    ["x86_64-unknown-linux-gnu", "amd64", "x86_64"],
    ["aarch64-unknown-linux-gnu", "arm64", "aarch64"],
  ]) {
    const f = fixture({
      ...environment,
      TARGET,
      RELEASE_VERSION: "v0.17.1-rc.1",
    });
    buildPackage(f.inputs)();
    const control = f.writes.find(
      (write) => write.path === "root/DEBIAN/control",
    );
    const spec = f.writes.find(
      (write) => write.path === "rpm/SPECS/fluentci.spec",
    );
    assert.match(control.text, /Version: 0\.17\.1~rc\.1/);
    assert.ok(control.text.includes(`Architecture: ${debArch}`));
    assert.ok(spec.text.includes(`BuildArch: ${rpmArch}`));
    assert.ok(
      f.calls.some(
        (args) => args[0] === "dpkg-deb" && args.includes("--build"),
      ),
    );
    assert.ok(
      f.calls.some((args) => args[0] === "rpmbuild" && args.includes(rpmArch)),
    );
    const checksums = f.writes.filter((write) =>
      write.path.endsWith(".sha256"),
    );
    assert.equal(checksums.length, 2);
    assert.ok(
      checksums.every((write) =>
        write.text.startsWith("a".repeat(64) + "  fluentci"),
      ),
    );
    assert.ok(!f.calls.some((args) => ["sh", "bash"].includes(args[0])));
    assert.ok(
      !JSON.stringify([f.calls, f.writes]).includes(environment.FURY_TOKEN),
    );
  }
});

test("invalid targets, versions and missing publication configuration fail before commands", () => {
  for (const TARGET of [
    "x86_64-apple-darwin",
    "x86_64-unknown-openbsd",
    "x86_64-unknown-linux-musl",
    "aarch64-unknown-linux-musl",
    "unknown",
  ]) {
    for (const job of [dependencies, buildPackage, upload]) {
      const f = fixture({ ...environment, TARGET });
      assert.throws(() => job(f.inputs)(), /Linux targets only/);
      assert.deepEqual(f.calls, []);
    }
  }
  for (const RELEASE_VERSION of [
    "../escape",
    "v0.17.0\nInjected: value",
    "1;false",
    "",
  ]) {
    const f = fixture({ ...environment, RELEASE_VERSION });
    assert.throws(() => buildPackage(f.inputs)());
    assert.deepEqual(f.calls, []);
  }

});

test("command and native metadata failures clean staging before propagating", () => {
  for (const options of [
    { fail: (args) => args[0] === "rpmbuild" },
    { failWrite: true },
  ]) {
    const f = fixture(environment, options);
    assert.throws(() => buildPackage(f.inputs)());
    assert.ok(
      f.calls.some(
        (args) =>
          args[0] === "rm" && args.at(-1) === "/tmp/fluentci-package-fixture",
      ),
    );
    assert.ok(!f.writes.some((write) => write.path.endsWith(".sha256")));
  }
});

test("package publishing calls the pinned registry module with CSV paths and inherited credentials", () => {
  const f = fixture(environment);
  upload(f.inputs)();
  const call = f.calls.find(args => args[0] === "fluentci");
  assert.deepEqual(call.slice(0,7), ["fluentci", "--check-update=false", "run", "--frozen-lockfile", "gemfury", "upload", "--files"]);
  assert.equal(call[7], "target/release-assets/fluentci_0.17.0_amd64.deb,target/release-assets/fluentci-0.17.0-1.x86_64.rpm");
  assert.ok(!JSON.stringify(f.calls).includes(environment.FURY_TOKEN));
  assert.ok(!f.calls.some(args => args[0] === "curl"));
});

test("packaging tools and GitHub package uploads also use literal argv", () => {
  const f = fixture(environment);
  dependencies(f.inputs)();
  github(f.inputs)();
  assert.ok(
    f.calls.some((args) => args.includes("rpm") && args.includes("dpkg-dev")),
  );
  const args = f.calls.find((args) => args[0] === "gh");
  assert.equal(args.filter((arg) => arg.endsWith(".sha256")).length, 2);
  assert.ok(!JSON.stringify(f.calls).includes(environment.GH_TOKEN));
});
