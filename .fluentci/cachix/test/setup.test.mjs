import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./host-fixture.mjs";
import {
  setup,
  setupWith,
  push,
  pushResultWith,
  runWithCache,
} from "../output/CI.Cachix/index.js";

// Execute compiled PureScript against a guest host stub. No CLI, Nix or Cachix
// process is launched, and no real environment variable or token is read.

test("missing, empty and whitespace tokens skip before reading cache input or invoking Nix", () => {
  for (const env of [
    {},
    { CACHIX_AUTH_TOKEN: "" },
    { CACHIX_AUTH_TOKEN: "  \n" },
  ]) {
    const f = fixture(env);
    setup({ cache: "fluentci" })();
    assert.match(f.output.join("\n"), /Skipping Cachix/);
    assert.ok(f.calls.every(([name]) => ["has_env", "get_env"].includes(name)));
  }
});

test("configures a cache from input without exposing the token", () => {
  const token = "test-only-secret";
  const f = fixture({ CACHIX_AUTH_TOKEN: token }, "fluentci");
  setup({ cache: "fluentci" })();
  const commands = f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));
  assert.deepEqual(commands[0], [
    "'nix'",
    "'run'",
    "'--no-write-lock-file'",
    "'--inputs-from'",
    "'.'",
    "'nixpkgs#cachix'",
    "'--'",
    "'use'",
    "'fluentci'",
  ]);
  assert.ok(!JSON.stringify([f.calls, f.output]).includes(token));
});

test("supports explicit typed cache names and composable setupWith", () => {
  let f = fixture({ CACHIX_AUTH_TOKEN: "secret", CACHIX_CACHE: "cache-123" });
  setup({ cache: "cache-123" })();
  assert.ok(JSON.stringify(f.calls).includes("cache-123"));
  f = fixture({ CACHIX_AUTH_TOKEN: "secret" });
  setupWith("another-cache")();
  assert.ok(JSON.stringify(f.calls).includes("another-cache"));
});

test("rejects missing or invalid cache names before creating a pipeline", () => {
  for (const input of [
    "",
    "--help",
    "a/b",
    "a; echo injected",
    "UPPER",
    "trailing-",
    "a".repeat(64),
  ]) {
    const f = fixture({ CACHIX_AUTH_TOKEN: "secret" }, input);
    assert.throws(() => setup({ cache: input })());
    assert.ok(!f.calls.some(([name]) => name === "pipeline"));
  }
});

test("setup errors propagate instead of silently continuing with a configured token", () => {
  const f = fixture({ CACHIX_AUTH_TOKEN: "secret" }, "fluentci");
  globalThis.Host.getFunctions = () => ({
    has_env: () => "true",
    get_env: () => "secret",
    set_runner: () => {
      throw new Error("Nix setup failed");
    },
  });
  assert.throws(() => setup({ cache: "fluentci" })(), /Nix setup failed/);
  assert.deepEqual(f.output, []);
});

test("authenticated builds use watch-exec and explicitly push the result closure without leaking tokens", () => {
  const token = "upload-secret";
  const f = fixture({ CACHIX_AUTH_TOKEN: token });
  runWithCache("fluentci")([
    "nix",
    "build",
    "--no-write-lock-file",
    ".#fluentci",
  ])();
  pushResultWith("fluentci")();
  const commands = f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));
  const watched = commands.find((args) => args.includes("'watch-exec'"));
  assert.deepEqual(watched.slice(7), [
    "'watch-exec'",
    "'fluentci'",
    "'--'",
    "'nix'",
    "'build'",
    "'--no-write-lock-file'",
    "'.#fluentci'",
  ]);
  const pushed = commands.find((args) => args.includes("'push'"));
  assert.deepEqual(pushed.slice(7), ["'push'", "'fluentci'", "'./result'"]);
  assert.ok(!JSON.stringify([f.calls, f.output]).includes(token));
});

test("without a token the build runs normally and upload is skipped", () => {
  for (const token of [undefined, "", "  "]) {
    const f = fixture(token === undefined ? {} : { CACHIX_AUTH_TOKEN: token });
    runWithCache("fluentci")(["nix", "build", ".#fluentci"])();
    pushResultWith("fluentci")();
    const commands = f.calls
      .filter(([name]) => name === "with_exec")
      .map(([, value]) => JSON.parse(value));
    assert.deepEqual(commands[0], ["'nix'", "'build'", "'.#fluentci'"]);
    assert.ok(!JSON.stringify(commands).includes("watch-exec"));
    assert.ok(!JSON.stringify(commands).includes("push"));
  }
});

test("explicit upload reads cache input and propagates upload failures", () => {
  let f = fixture({ CACHIX_AUTH_TOKEN: "secret" }, "fluentci");
  push({ cache: "fluentci" })();
  assert.ok(JSON.stringify(f.calls).includes("'push'"));
  f = fixture({ CACHIX_AUTH_TOKEN: "secret" }, "fluentci");
  globalThis.Host.getFunctions = () => ({
    has_env: () => "true",
    get_env: () => "secret",
    set_runner: () => {
      throw new Error("Cachix upload denied");
    },
  });
  assert.throws(() => push({ cache: "fluentci" })(), /Cachix upload denied/);
  assert.deepEqual(f.output, []);
});
