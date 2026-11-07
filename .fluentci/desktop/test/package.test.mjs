import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
  ftruncateSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clean, package as packageApp } from "../output/CI.Desktop/index.js";
import * as entry from "../entry.mjs";
import { validateExports } from "../validate-exports.mjs";

test("Wasm declarations include every desktop entry point", () => {
  validateExports(entry);
  assert.throws(
    () =>
      validateExports(
        entry,
        'declare module "main" { export function build(): I32; }',
      ),
    /Desktop Wasm declarations must match JavaScript exports/,
  );
});

// Run compiled PureScript through a host bridge in a disposable fixture. No
// FluentCI CLI is launched. Native DMG creation is an explicit macOS opt-in.
function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "fluentci-desktop-package-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const env = {
    TARGET: "aarch64-apple-darwin",
    RELEASE_VERSION: "v0.17.2",
    GITHUB_ACTIONS: "",
    CI_TEST_LOG: join(root, "commands.jsonl"),
    CI_TEST_LOGICAL_BYTES: "4294967296",
    ...options.env,
  };
  for (const program of ["codesign", "cargo", "hdiutil", "stat", "ditto"]) {
    writeFileSync(
      join(bin, program),
      `#!${process.execPath}
import {appendFileSync, writeFileSync, cpSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const program=${JSON.stringify(program)}, args=process.argv.slice(2);
appendFileSync(process.env.CI_TEST_LOG, JSON.stringify({program,args})+'\\n');
if (process.env.CI_TEST_FAIL===program+':'+args[0]) { console.error(program+' fixture failure'); process.exit(9); }
if (program==='stat') for (const path of args.slice(2)) console.log(process.env.CI_TEST_LOGICAL_BYTES || statSync(path).size);
if (program==='ditto') {
  if (${Boolean(options.native)}) process.stdout.write(execFileSync('/usr/bin/ditto',args));
  else if(args[0]==='-c') writeFileSync(args.at(-1),'zip fixture');
  else cpSync(args[0],args[1],{recursive:true});
}
if (program==='hdiutil') {
  if (${Boolean(options.native)}) process.stdout.write(execFileSync('/usr/bin/hdiutil',args));
  else if(args[0]==='create') writeFileSync(args.at(-1),'dmg fixture');
}
`,
      { mode: 0o755 },
    );
  }
  const app = `desktop/src-tauri/target/${env.TARGET}/release/bundle/macos/FluentCI Studio.app`;
  const executable = join(root, app, "Contents/MacOS/fluentci-desktop");
  mkdirSync(join(executable, ".."), { recursive: true });
  writeFileSync(executable, "fixture executable");
  let pending = [],
    cwd = root,
    pipelineEnv = {};
  globalThis.Memory = {
    fromString: (value) => ({ offset: value }),
    find: (value) => ({ readString: () => value }),
  };
  globalThis.Host = {
    outputString: () => {},
    getFunctions: () =>
      new Proxy(
        {},
        {
          get: (_, name) => (value) => {
            if (name === "has_env")
              return JSON.stringify(Object.hasOwn(env, value));
            if (name === "get_env") return env[value];
            if (name === "pipeline") {
              pending = [];
              cwd = root;
              pipelineEnv = {};
              return JSON.stringify({ id: "fixture" });
            }
            if (name === "with_workdir") cwd = join(root, value);
            if (name === "set_envs")
              Object.assign(pipelineEnv, Object.fromEntries(JSON.parse(value)));
            if (name === "with_exec") {
              const args = JSON.parse(value);
              pending.push(
                args.length === 1 && !args[0].startsWith("'")
                  ? ["/bin/sh", "-eu", "-c", args[0]]
                  : args.map((arg) => {
                      assert.ok(arg.startsWith("'") && arg.endsWith("'"));
                      return arg.slice(1, -1).replaceAll("'\\''", "'");
                    }),
              );
            }
            if (name === "stdout")
              return pending
                .map(([program, ...args]) => {
                  const result = spawnSync(program, args, {
                    cwd,
                    encoding: "utf8",
                    env: {
                      ...process.env,
                      ...env,
                      ...pipelineEnv,
                      PATH: bin + ":" + process.env.PATH,
                    },
                  });
                  if (result.error) throw result.error;
                  if (result.status !== 0)
                    throw Error(
                      `${program}: ${result.stdout}\n${result.stderr}`,
                    );
                  return result.stdout;
                })
                .join("");
            return "";
          },
        },
      ),
  };
  const commands = () =>
    existsSync(env.CI_TEST_LOG)
      ? readFileSync(env.CI_TEST_LOG, "utf8").trim().split("\n").map(JSON.parse)
      : [];
  return { root, app, executable, commands };
}

test("packaging uses logical bytes plus headroom, signs first, verifies the image, and hashes both assets", (t) => {
  const f = fixture(t);
  packageApp();
  const commands = f.commands();
  assert.deepEqual(
    commands.slice(0, 2).map(({ program, args }) => [program, args[0]]),
    [
      ["codesign", "--force"],
      ["codesign", "--verify"],
    ],
  );
  const create = commands.find(
    ({ program, args }) => program === "hdiutil" && args[0] === "create",
  );
  assert.equal(create.args[create.args.indexOf("-size") + 1], "6272m");
  assert.equal(create.args[create.args.indexOf("-fs") + 1], "HFS+");
  const verify = commands.find(
    ({ program, args }) => program === "hdiutil" && args[0] === "verify",
  );
  assert.equal(verify.args[1], create.args.at(-1));
  assert.ok(
    commands.indexOf(verify) <
      commands.findIndex(
        ({ program, args }) => program === "ditto" && args[0] === "-c",
      ),
  );
  for (const extension of ["dmg", "app.zip"]) {
    const name = `FluentCI-Studio_v0.17.2_aarch64-apple-darwin.${extension}`;
    const path = join(f.root, "desktop/release-assets", name);
    assert.equal(
      readFileSync(path + ".sha256", "utf8").trim(),
      `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${name}`,
    );
  }
});

test("CI cleanup preserves the app, bundle resources, and dependency artifacts", (t) => {
  const f = fixture(t, { env: { GITHUB_ACTIONS: "true" } });
  const base = join(f.root, "desktop/src-tauri/target");
  mkdirSync(join(f.root, "node_modules"));
  mkdirSync(join(f.root, "webui/node_modules"), { recursive: true });
  for (const dir of [
    "debug",
    `${"aarch64-apple-darwin"}/debug`,
    "release/incremental",
    `${"aarch64-apple-darwin"}/release/incremental`,
  ])
    mkdirSync(join(base, dir), { recursive: true });
  mkdirSync(join(base, "aarch64-apple-darwin/release/deps"), {
    recursive: true,
  });
  const dependency = join(
    base,
    "aarch64-apple-darwin/release/deps/libdependency.rlib",
  );
  writeFileSync(dependency, "cached dependency");
  const resource = join(f.root, f.app, "Contents/Resources/incremental");
  mkdirSync(resource, { recursive: true });
  clean();
  assert.ok(existsSync(f.executable));
  assert.ok(existsSync(resource));
  assert.ok(existsSync(dependency));
  assert.ok(!existsSync(join(base, "debug")));
  assert.ok(!existsSync(join(base, "release/incremental")));
  assert.ok(!existsSync(join(f.root, "node_modules")));
  assert.ok(!existsSync(join(f.root, "webui/node_modules")));
  assert.deepEqual(
    f.commands().find(({ program }) => program === "cargo").args,
    [
      "clean",
      "--release",
      "--locked",
      "--manifest-path",
      "desktop/src-tauri/Cargo.toml",
      "--target",
      "aarch64-apple-darwin",
      "--package",
      "fluentci",
      "--package",
      "fluentci-desktop",
    ],
  );
});

test("cleanup leaves local builds alone and packaging stops on signing or image verification failure", (t) => {
  let f = fixture(t);
  clean();
  assert.ok(existsSync(f.executable));
  assert.equal(f.commands().length, 0);
  f = fixture(t, { env: { CI_TEST_FAIL: "codesign:--verify" } });
  assert.throws(() => packageApp(), /codesign/);
  assert.ok(!existsSync(join(f.root, "desktop/release-assets")));
  f = fixture(t, { env: { CI_TEST_FAIL: "hdiutil:verify" } });
  assert.throws(() => packageApp(), /hdiutil/);
  assert.ok(
    !f
      .commands()
      .some(({ program, args }) => program === "ditto" && args[0] === "-c"),
  );
});

test(
  "native macOS DMG can package a sparse app payload",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.FLUENTCI_TEST_NATIVE_DMG !== "1",
  },
  (t) => {
    const f = fixture(t, { native: true, env: { CI_TEST_LOGICAL_BYTES: "" } });
    const fd = openSync(f.executable, "w");
    ftruncateSync(fd, 64 * 1024 * 1024);
    closeSync(fd);
    packageApp();
    const create = f
      .commands()
      .find(
        ({ program, args }) => program === "hdiutil" && args[0] === "create",
      );
    assert.ok(parseInt(create.args[create.args.indexOf("-size") + 1]) >= 224);
  },
);
