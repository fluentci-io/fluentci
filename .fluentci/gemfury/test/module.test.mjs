import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../../cachix/test/host-fixture.mjs";
import {
  dependencies,
  package as buildPackage,
  upload,
} from "../output/CI.Gemfury/index.js";

const environment = {
  TARGET: "x86_64-unknown-linux-gnu",
  RELEASE_VERSION: "v0.17.0",
  FURY_ACCOUNT: "fluentci",
  FURY_USER: "publisher",
  FURY_TOKEN: "test-only-token",
};
const commands = (f) =>
  f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));

test("missing or blank tokens skip upload before creating a pipeline", () => {
  for (const env of [{}, { FURY_TOKEN: "" }, { FURY_TOKEN: " \n" }]) {
    const f = fixture(env);
    upload();
    assert.match(f.output.join("\n"), /Skipping Gemfury/);
    assert.ok(!f.calls.some(([name]) => name === "pipeline"));
  }
});

test("both Linux architectures package and upload without embedding credentials", () => {
  for (const TARGET of [
    "x86_64-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
  ]) {
    const f = fixture({ ...environment, TARGET });
    buildPackage();
    upload();
    assert.ok(
      commands(f).some((args) =>
        args.includes("'.github/scripts/package-linux-release.sh'"),
      ),
    );
    assert.ok(
      commands(f).some((args) =>
        args.includes("'.github/scripts/upload-gemfury.sh'"),
      ),
    );
    assert.ok(
      !JSON.stringify([f.calls, f.output]).includes(environment.FURY_TOKEN),
    );
  }
});

test("invalid targets and missing publication metadata fail before effects", () => {
  for (const TARGET of [
    "x86_64-apple-darwin",
    "x86_64-unknown-openbsd",
    "unknown",
  ]) {
    for (const job of [dependencies, buildPackage, upload]) {
      const f = fixture({ ...environment, TARGET });
      assert.throws(job, /Linux targets only/);
      assert.ok(!f.calls.some(([name]) => name === "pipeline"));
    }
  }
  for (const key of [
    "TARGET",
    "RELEASE_VERSION",
    "FURY_USER",
    "FURY_ACCOUNT",
  ]) {
    const env = { ...environment };
    delete env[key];
    const f = fixture(env);
    assert.throws(upload, new RegExp(key));
    assert.ok(!f.calls.some(([name]) => name === "pipeline"));
  }
});

test("package tools install through the module and failures propagate", () => {
  const f = fixture(environment);
  dependencies();
  assert.ok(
    commands(f).some(
      (args) => args.includes("'rpm'") && args.includes("'dpkg-dev'"),
    ),
  );
  const host = globalThis.Host.getFunctions;
  globalThis.Host.getFunctions = () =>
    new Proxy(host(), {
      get: (target, name) =>
        name === "stdout"
          ? () => {
              throw new Error("Upload rejected");
            }
          : target[name],
    });
  assert.throws(upload, /Upload rejected/);
});
