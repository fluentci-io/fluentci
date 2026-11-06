import test from "node:test";
import assert from "node:assert/strict";
import { setup, setupWith } from "../output/CI.Cachix/index.js";

// Execute compiled PureScript against a guest host stub. No CLI, Nix or Cachix
// process is launched, and no real environment variable or token is read.
function fixture(env = {}, input = "") {
  const calls = [];
  const output = [];
  globalThis.Memory = {
    fromString: (value) => ({ offset: value }),
    find: (value) => ({ readString: () => value }),
  };
  globalThis.Host = {
    inputString: () => input,
    outputString: (value) => output.push(value),
    getFunctions: () =>
      new Proxy(
        {},
        {
          get: (_target, name) => (value) => {
            calls.push([name, value]);
            if (name === "has_env")
              return JSON.stringify(Object.hasOwn(env, value));
            if (name === "get_env") return env[value];
            if (name === "pipeline") return JSON.stringify({ id: "fixture" });
            if (name === "stdout") return "configured";
            return "";
          },
        },
      ),
  };
  return { calls, output };
}

test("missing, empty and whitespace tokens skip before reading cache input or invoking Nix", () => {
  for (const env of [
    {},
    { CACHIX_AUTH_TOKEN: "" },
    { CACHIX_AUTH_TOKEN: "  \n" },
  ]) {
    const f = fixture(env);
    setup();
    assert.match(f.output.join("\n"), /Skipping Cachix/);
    assert.ok(f.calls.every(([name]) => ["has_env", "get_env"].includes(name)));
  }
});

test("configures a cache from input without exposing the token", () => {
  const token = "test-only-secret";
  const f = fixture({ CACHIX_AUTH_TOKEN: token }, "fluentci");
  setup();
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

test("supports an environment fallback and composable setupWith", () => {
  let f = fixture({ CACHIX_AUTH_TOKEN: "secret", CACHIX_CACHE: "cache-123" });
  setup();
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
    assert.throws(() => setup());
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
  assert.throws(() => setup(), /Nix setup failed/);
  assert.deepEqual(f.output, []);
});
