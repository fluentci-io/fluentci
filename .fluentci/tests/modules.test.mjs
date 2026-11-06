import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const binary = resolve(
  process.env.FLUENTCI_BIN ?? join(root, "target/release/fluentci"),
);

function fixture(t) {
  mkdirSync(join(root, "target"), { recursive: true });
  const directory = mkdtempSync(join(root, "target/ci-modules-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  mkdirSync(bin);
  mkdirSync(join(directory, "webui"));
  const log = join(directory, "commands.jsonl");
  const mock = join(bin, "command.mjs");
  writeFileSync(
    mock,
    `import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
const command = basename(process.argv[1]);
appendFileSync(process.env.CI_TEST_LOG, JSON.stringify({command, args: process.argv.slice(2), cwd: process.cwd()}) + "\\n");
if (process.env.CI_TEST_FAIL === command + ":" + process.argv[2]) process.exit(7);
if (command === "hdiutil") writeFileSync(process.argv.at(-1), "fixture dmg");
if (command === "ditto" && process.argv.includes("-c")) writeFileSync(process.argv.at(-1), "fixture zip");
if (command === "bun" && process.argv[2] === "run") {
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.html", "studio fixture");
}
`,
  );
  for (const program of [
    "cargo",
    "bun",
    "gh",
    "nix",
    "flakehub-push",
    "sudo",
    "python3",
    "codesign",
    "hdiutil",
    "ditto",
  ]) {
    const path = join(bin, program);
    // The mock keeps the real program name while executing the same JS body.
    writeFileSync(path, `#!/usr/bin/env node\n${readFileSync(mock, "utf8")}`);
    chmodSync(path, 0o755);
  }
  symlinkSync(process.execPath, join(bin, "node"));
  function run(module, fn, extra = {}) {
    const env = {
      ...process.env,
      PATH: bin + delimiter + process.env.PATH,
      CI_TEST_LOG: log,
      ...extra,
    };
    delete env.FLUENTCI_PROJECT_ID;
    for (const [key, value] of Object.entries(extra))
      if (value == null) delete env[key];
    const result = spawnSync(
      binary,
      [
        "--check-update=false",
        "--database",
        join(directory, "test.db"),
        "run",
        "--work-dir",
        directory,
        ...(module.endsWith(".wasm") ? ["--wasm"] : []),
        module,
        fn,
      ],
      { cwd: directory, env, encoding: "utf8", timeout: 120_000 },
    );
    if (result.error) throw result.error;
    return result;
  }
  function commands() {
    return existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse)
      : [];
  }
  return { directory, bin, run, commands };
}

function success(result) {
  assert.equal(result.status, 0, result.stderr + result.stdout);
}

test("Rust checks build Studio first and use release Cargo commands", (t) => {
  const f = fixture(t);
  success(f.run("rust", "check"));
  const commands = f.commands();
  assert.deepEqual(
    commands.map(({ command, args }) => [command, ...args]),
    [
      ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
      ["bun", "run", "build:web"],
      ["cargo", "fmt", "--all", "--check"],
      [
        "cargo",
        "clippy",
        "--release",
        "--all-targets",
        "--locked",
        "--",
        "-D",
        "warnings",
      ],
      ["cargo", "test", "--release", "--locked"],
    ],
  );
  assert.equal(commands[0].cwd, join(f.directory, "webui"));
  assert.equal(commands[4].cwd, f.directory);
});

test("failed builds stop the remaining CI commands", (t) => {
  const f = fixture(t);
  assert.notEqual(
    f.run("rust", "check", { CI_TEST_FAIL: "bun:run" }).status,
    0,
  );
  assert.deepEqual(
    f.commands().map(({ command }) => command),
    ["bun", "bun"],
  );
  const g = fixture(t);
  assert.notEqual(
    g.run("rust", "check", { CI_TEST_FAIL: "cargo:clippy" }).status,
    0,
  );
  assert.deepEqual(
    g
      .commands()
      .filter(({ command }) => command === "cargo")
      .map(({ args }) => args[0]),
    ["fmt", "clippy"],
  );
});

test("release builds only the requested target after Studio", (t) => {
  const f = fixture(t);
  success(f.run("release", "build", { TARGET: "aarch64-apple-darwin" }));
  assert.deepEqual(
    f.commands().map(({ command, args }) => [command, ...args]),
    [
      ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
      ["bun", "run", "build:web"],
      [
        "cargo",
        "build",
        "--release",
        "--locked",
        "--target",
        "aarch64-apple-darwin",
      ],
    ],
  );
});

test("release archives contain the binary and a valid checksum; upload passes exact paths", (t) => {
  const f = fixture(t);
  const env = { TARGET: "ci-test-target", RELEASE_VERSION: "v0.0.0-ci-test" };
  const source = join(f.directory, "target", env.TARGET, "release");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "fluentci"), "fixture binary\n");
  success(f.run("release", "package", env));
  const archiveName = `fluentci_${env.RELEASE_VERSION}_${env.TARGET}.tar.gz`;
  const archive = join(f.directory, "target/release-assets", archiveName);
  const checksum = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  assert.equal(
    readFileSync(archive + ".sha256", "utf8").trim(),
    `${checksum}  ${archiveName}`,
  );
  const unpacked = spawnSync("tar", ["xOzf", archive, "fluentci"], {
    encoding: "utf8",
  });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  assert.equal(unpacked.stdout, "fixture binary\n");
  success(f.run("release", "upload", env));
  assert.deepEqual(f.commands().at(-1).args, [
    "release",
    "upload",
    env.RELEASE_VERSION,
    `target/release-assets/${archiveName}`,
    `target/release-assets/${archiveName}.sha256`,
    "--clobber",
  ]);
});

test("Nix checks and FlakeHub publishing use the configured commands", (t) => {
  const f = fixture(t);
  success(f.run("nix", "check"));
  success(f.run("nix", "metadata"));
  success(f.run("nix", "flakehub", { RELEASE_VERSION: "v0.0.0-ci-test" }));
  assert.deepEqual(
    f.commands().map(({ command, args }) => [command, ...args]),
    [
      ["nix", "flake", "check", "--no-write-lock-file"],
      ["nix", "flake", "metadata", "--json", "--no-write-lock-file"],
      [
        "nix",
        "flake",
        "show",
        "--json",
        "--all-systems",
        "--no-write-lock-file",
      ],
      [
        "flakehub-push",
        "--visibility",
        "public",
        "--name",
        "fluentci-io/fluentci",
        "--tag",
        "v0.0.0-ci-test",
      ],
    ],
  );
});

test("release and publishing jobs reject missing configuration before commands run", (t) => {
  const f = fixture(t);
  for (const [module, fn, env, variable] of [
    ["release", "build", { TARGET: null }, "TARGET"],
    [
      "release",
      "package",
      { TARGET: "ci-test-target", RELEASE_VERSION: null },
      "RELEASE_VERSION",
    ],
    ["nix", "flakestry", { VERSION: null }, "VERSION"],
  ]) {
    const result = f.run(module, fn, env);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      new RegExp(`Set ${variable} before running this job`),
    );
  }
});

test("prepared release builds use downloaded Wasm and need no source SDK tools", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.directory, "webui/dist"));
  writeFileSync(join(f.directory, "webui/dist/index.html"), "prebuilt studio");
  const module = join(root, ".fluentci/release/dist/plugin.wasm");
  success(
    f.run(module, "buildPrepared", {
      TARGET: "x86_64-unknown-linux-gnu",
      PATH: f.bin + delimiter + "/usr/bin:/bin",
    }),
  );
  assert.deepEqual(
    f.commands().map(({ command, args }) => [command, ...args]),
    [
      [
        "cargo",
        "build",
        "--release",
        "--locked",
        "--target",
        "x86_64-unknown-linux-gnu",
      ],
    ],
  );
});

test("prepared release builds fail before Cargo when Studio assets are missing", (t) => {
  const f = fixture(t);
  const result = f.run(
    join(root, ".fluentci/release/dist/plugin.wasm"),
    "buildPrepared",
    { TARGET: "x86_64-unknown-linux-gnu" },
  );
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.commands(), []);
});

test("BSD upload and runner setup run through the compiled module", (t) => {
  const f = fixture(t);
  const module = join(root, ".fluentci/release/dist/plugin.wasm");
  success(
    f.run(module, "bsdUpload", {
      TARGET: "x86_64-unknown-netbsd",
      RELEASE_VERSION: "v0.0.0-ci-test",
    }),
  );
  success(f.run(module, "linuxDependencies"));
  const commands = f.commands();
  assert.deepEqual(commands[0].args, [
    "release",
    "upload",
    "v0.0.0-ci-test",
    "dist/bsd/x86_64-unknown-netbsd/fluentci_v0.0.0-ci-test_x86_64-unknown-netbsd.tar.gz",
    "dist/bsd/x86_64-unknown-netbsd/fluentci_v0.0.0-ci-test_x86_64-unknown-netbsd.tar.gz.sha256",
    "--clobber",
  ]);
  assert.deepEqual(
    commands.slice(1).map(({ command, args }) => [command, ...args]),
    [
      ["sudo", "apt-get", "update"],
      [
        "sudo",
        "apt-get",
        "install",
        "--yes",
        "build-essential",
        "cmake",
        "pkg-config",
      ],
    ],
  );
});

test("release preparation validates inputs before building Studio on the input runner", (t) => {
  const f = fixture(t);
  success(
    f.run(join(root, ".fluentci/release/dist/plugin.wasm"), "prepare", {
      RELEASE_VERSION: "2026.11.04",
    }),
  );
  assert.deepEqual(
    f.commands().map(({ command, args }) => [command, ...args]),
    [
      [
        "gh",
        "release",
        "view",
        "2026.11.04",
        "--json",
        "tagName",
        "--jq",
        ".tagName",
      ],
      ["python3", ".github/scripts/check-openbsd-msrv.py"],
      ["python3", ".github/scripts/test-bsd-release-verification.py", "-v"],
      [
        "python3",
        ".github/scripts/create-bsd-smoke-fixtures.py",
        ".release-smoke",
      ],
      ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
      ["bun", "run", "build:web"],
    ],
  );
});

test("release preparation rejects unsafe tags before external commands", (t) => {
  const f = fixture(t);
  const result = f.run(
    join(root, ".fluentci/release/dist/plugin.wasm"),
    "prepare",
    { RELEASE_VERSION: "../../invalid" },
  );
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.commands(), []);
});

test("compiled BSD functions invoke the native helper and copied-back verifier", (t) => {
  const f = fixture(t);
  const scripts = join(f.directory, ".github/scripts");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(
    join(scripts, "build-bsd-release.sh"),
    "#!/bin/sh\nprintf bsd-build > bsd-built\n",
  );
  const module = join(root, ".fluentci/release/dist/plugin.wasm");
  success(f.run(module, "bsdBuild"));
  assert.equal(
    readFileSync(join(f.directory, "bsd-built"), "utf8"),
    "bsd-build",
  );
  success(
    f.run(module, "bsdVerify", {
      TARGET: "x86_64-unknown-openbsd",
      RELEASE_VERSION: "2026.11.04",
    }),
  );
  assert.deepEqual(f.commands().at(-1).args, [
    ".github/scripts/verify-bsd-release.py",
    "dist/bsd/x86_64-unknown-openbsd",
    "2026.11.04",
    "x86_64-unknown-openbsd",
  ]);
});

test("desktop builds both macOS targets with frozen dependencies and the locked release wrapper", (t) => {
  for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
    const f = fixture(t);
    mkdirSync(join(f.directory, "desktop"));
    success(
      f.run(join(root, ".fluentci/desktop/dist/plugin.wasm"), "build", {
        TARGET: target,
      }),
    );
    assert.deepEqual(
      f.commands().map(({ command, args }) => [command, ...args]),
      [
        ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
        [
          "bun",
          "run",
          "build",
          "--target",
          target,
          "--bundles",
          "app",
          "--no-sign",
        ],
      ],
    );
    assert.ok(
      f.commands().every(({ cwd }) => cwd === join(f.directory, "desktop")),
    );
  }
});

test("desktop packaging signs and verifies before creating installers and checksums", (t) => {
  const f = fixture(t);
  const env = { TARGET: "aarch64-apple-darwin", RELEASE_VERSION: "2026.11.04" };
  const app = `desktop/src-tauri/target/${env.TARGET}/release/bundle/macos/FluentCI Studio.app`;
  mkdirSync(join(f.directory, app), { recursive: true });
  const module = join(root, ".fluentci/desktop/dist/plugin.wasm");
  success(f.run(module, "package", env));
  const commands = f.commands();
  assert.deepEqual(
    commands.slice(0, 2).map(({ command, args }) => [command, ...args]),
    [
      ["codesign", "--force", "--deep", "--sign", "-", app],
      ["codesign", "--verify", "--deep", "--strict", "--verbose=2", app],
    ],
  );
  for (const extension of [".dmg", ".app.zip"]) {
    const asset = `FluentCI-Studio_${env.RELEASE_VERSION}_${env.TARGET}${extension}`;
    const path = join(f.directory, "desktop/release-assets", asset);
    const checksum = createHash("sha256")
      .update(readFileSync(path))
      .digest("hex");
    assert.equal(
      readFileSync(path + ".sha256", "utf8").trim(),
      `${checksum}  ${asset}`,
    );
  }
  success(f.run(module, "upload", env));
  const asset = `desktop/release-assets/FluentCI-Studio_${env.RELEASE_VERSION}_${env.TARGET}`;
  assert.deepEqual(f.commands().at(-1).args, [
    "release",
    "upload",
    env.RELEASE_VERSION,
    asset + ".dmg",
    asset + ".dmg.sha256",
    asset + ".app.zip",
    asset + ".app.zip.sha256",
    "--clobber",
  ]);
});

test("desktop packaging stops when signature verification fails", (t) => {
  const f = fixture(t);
  const target = "x86_64-apple-darwin";
  mkdirSync(
    join(
      f.directory,
      `desktop/src-tauri/target/${target}/release/bundle/macos/FluentCI Studio.app`,
    ),
    { recursive: true },
  );
  const result = f.run(
    join(root, ".fluentci/desktop/dist/plugin.wasm"),
    "package",
    {
      TARGET: target,
      RELEASE_VERSION: "v0.1.0",
      CI_TEST_FAIL: "codesign:--verify",
    },
  );
  assert.notEqual(result.status, 0);
  assert.deepEqual(
    f.commands().map(({ command }) => command),
    ["codesign", "codesign"],
  );
  assert.equal(existsSync(join(f.directory, "desktop/release-assets")), false);
});

test("desktop jobs reject invalid targets and unsafe release tags", (t) => {
  const module = join(root, ".fluentci/desktop/dist/plugin.wasm");
  for (const env of [
    { TARGET: "../invalid", RELEASE_VERSION: "v0.1.0" },
    { TARGET: "aarch64-apple-darwin", RELEASE_VERSION: "../../invalid" },
    { TARGET: "aarch64-apple-darwin", RELEASE_VERSION: null },
  ]) {
    const f = fixture(t);
    assert.notEqual(f.run(module, "package", env).status, 0);
    assert.deepEqual(f.commands(), []);
  }
});

test("Nix build module invokes the locked FluentCI package build", (t) => {
  const f = fixture(t);
  success(f.run("nix-build", "build", { CACHIX_AUTH_TOKEN: null }));
  assert.deepEqual(
    f.commands().map(({ command, args }) => [command, ...args]),
    [["nix", "build", "--no-write-lock-file", ".#fluentci"]],
  );
});

test("Nix builds watch and push store paths when Cachix authentication is configured", (t) => {
  const f = fixture(t);
  success(
    f.run("nix-build", "build", { CACHIX_AUTH_TOKEN: "test-only-token" }),
  );
  const commands = f.commands().map(({ command, args }) => [command, ...args]);
  const prefix = [
    "nix",
    "run",
    "--no-write-lock-file",
    "--inputs-from",
    ".",
    "nixpkgs#cachix",
    "--",
  ];
  assert.deepEqual(commands, [
    [
      ...prefix,
      "watch-exec",
      "fluentci",
      "--",
      "nix",
      "build",
      "--no-write-lock-file",
      ".#fluentci",
    ],
    [...prefix, "push", "fluentci", "./result"],
  ]);
  assert.ok(!JSON.stringify(commands).includes("test-only-token"));
});

test("failed watched Nix builds stop before the final cache push", (t) => {
  const f = fixture(t);
  assert.notEqual(
    f.run("nix-build", "build", {
      CACHIX_AUTH_TOKEN: "test-only-token",
      CI_TEST_FAIL: "nix:run",
    }).status,
    0,
  );
  assert.equal(f.commands().length, 1);
});
