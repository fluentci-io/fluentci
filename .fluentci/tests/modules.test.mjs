import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const binary = resolve(process.env.FLUENTCI_BIN ?? join(root, "target/release/fluentci"));

function fixture(t) {
  mkdirSync(join(root, "target"), { recursive: true });
  const directory = mkdtempSync(join(root, "target/ci-modules-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  mkdirSync(bin);
  mkdirSync(join(directory, "webui"));
  const log = join(directory, "commands.jsonl");
  const mock = join(bin, "command.mjs");
  writeFileSync(mock, `import { appendFileSync } from "node:fs";
import { basename } from "node:path";
const command = basename(process.argv[1]);
appendFileSync(process.env.CI_TEST_LOG, JSON.stringify({command, args: process.argv.slice(2), cwd: process.cwd()}) + "\\n");
if (process.env.CI_TEST_FAIL === command + ":" + process.argv[2]) process.exit(7);
`);
  for (const program of ["cargo", "bun", "gh", "nix", "flakehub-push"]) {
    const path = join(bin, program);
    // The mock keeps the real program name while executing the same JS body.
    writeFileSync(path, `#!/usr/bin/env node\n${readFileSync(mock, "utf8")}`);
    chmodSync(path, 0o755);
  }
  function run(module, fn, extra = {}) {
    const env = { ...process.env, PATH: bin + delimiter + process.env.PATH, CI_TEST_LOG: log, ...extra };
    delete env.FLUENTCI_PROJECT_ID;
    for (const [key, value] of Object.entries(extra)) if (value == null) delete env[key];
    const result = spawnSync(binary, ["--check-update=false", "--database", join(directory, "test.db"), "run", "--work-dir", directory, module, fn], { cwd: directory, env, encoding: "utf8", timeout: 120_000 });
    if (result.error) throw result.error;
    return result;
  }
  function commands() {
    return readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
  }
  return { directory, run, commands };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr + result.stdout);
}

test("Rust checks build Studio first and use release Cargo commands", t => {
  const f = fixture(t);
  success(f.run("rust", "check"));
  const commands = f.commands();
  assert.deepEqual(commands.map(({ command, args }) => [command, ...args]), [
    ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
    ["bun", "run", "build:web"],
    ["cargo", "fmt", "--all", "--check"],
    ["cargo", "clippy", "--release", "--all-targets", "--locked", "--", "-D", "warnings"],
    ["cargo", "test", "--release", "--locked"],
  ]);
  assert.equal(commands[0].cwd, join(f.directory, "webui"));
  assert.equal(commands[4].cwd, f.directory);
});

test("failed builds stop the remaining CI commands", t => {
  const f = fixture(t);
  assert.notEqual(f.run("rust", "check", { CI_TEST_FAIL: "bun:run" }).status, 0);
  assert.deepEqual(f.commands().map(({ command }) => command), ["bun", "bun"]);
  const g = fixture(t);
  assert.notEqual(g.run("rust", "check", { CI_TEST_FAIL: "cargo:clippy" }).status, 0);
  assert.deepEqual(g.commands().filter(({ command }) => command === "cargo").map(({ args }) => args[0]), ["fmt", "clippy"]);
});

test("release builds only the requested target after Studio", t => {
  const f = fixture(t);
  success(f.run("release", "build", { TARGET: "aarch64-apple-darwin" }));
  assert.deepEqual(f.commands().map(({ command, args }) => [command, ...args]), [
    ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
    ["bun", "run", "build:web"],
    ["cargo", "build", "--release", "--locked", "--target", "aarch64-apple-darwin"],
  ]);
});

test("release archives contain the binary and a valid checksum; upload passes exact paths", t => {
  const f = fixture(t);
  const env = { TARGET: "ci-test-target", RELEASE_VERSION: "v0.0.0-ci-test" };
  const source = join(f.directory, "target", env.TARGET, "release");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "fluentci"), "fixture binary\n");
  success(f.run("release", "package", env));
  const archiveName = `fluentci_${env.RELEASE_VERSION}_${env.TARGET}.tar.gz`;
  const archive = join(f.directory, "target/release-assets", archiveName);
  const checksum = createHash("sha256").update(readFileSync(archive)).digest("hex");
  assert.equal(readFileSync(archive + ".sha256", "utf8").trim(), `${checksum}  ${archiveName}`);
  const unpacked = spawnSync("tar", ["xOzf", archive, "fluentci"], { encoding: "utf8" });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  assert.equal(unpacked.stdout, "fixture binary\n");
  success(f.run("release", "upload", env));
  assert.deepEqual(f.commands().at(-1).args, ["release", "upload", env.RELEASE_VERSION, `target/release-assets/${archiveName}`, `target/release-assets/${archiveName}.sha256`]);
});

test("Nix checks and FlakeHub publishing use the configured commands", t => {
  const f = fixture(t);
  success(f.run("nix", "check"));
  success(f.run("nix", "metadata"));
  success(f.run("nix", "flakehub", { RELEASE_VERSION: "v0.0.0-ci-test" }));
  assert.deepEqual(f.commands().map(({ command, args }) => [command, ...args]), [
    ["nix", "flake", "check", "--no-write-lock-file"],
    ["nix", "flake", "metadata", "--json", "--no-write-lock-file"],
    ["nix", "flake", "show", "--json", "--all-systems", "--no-write-lock-file"],
    ["flakehub-push", "--visibility", "public", "--name", "fluentci-io/fluentci", "--tag", "v0.0.0-ci-test"],
  ]);
});

test("release and publishing jobs reject missing configuration before commands run", t => {
  const f = fixture(t);
  for (const [module, fn, env, variable] of [
    ["release", "build", { TARGET: null }, "TARGET"],
    ["release", "package", { TARGET: "ci-test-target", RELEASE_VERSION: null }, "RELEASE_VERSION"],
    ["nix", "flakestry", { VERSION: null }, "VERSION"],
  ]) {
    const result = f.run(module, fn, env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Set ${variable} before running this job`));
  }
});
