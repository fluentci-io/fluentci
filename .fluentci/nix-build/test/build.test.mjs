import test from "node:test";
import assert from "node:assert/strict";
import { build } from "../output/CI.NixBuild/index.js";
import { fixture } from "./host-fixture.mjs";

const commands = (f) =>
  f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));

test("Nix build uploads build paths and the final closure when authenticated", () => {
  const f = fixture({ CACHIX_AUTH_TOKEN: "fake-token" });
  build({ cache: "fluentci" })();
  const invocations = commands(f).filter((args) => args[0] === "'cachix'");
  assert.deepEqual(invocations, [
    [
      "'cachix'",
      "'watch-exec'",
      "'fluentci'",
      "'--'",
      "'nix'",
      "'build'",
      "'--no-write-lock-file'",
      "'.#fluentci'",
    ],
    ["'cachix'", "'push'", "'fluentci'", "'./result'"],
  ]);
  assert.ok(!JSON.stringify([f.calls, f.output]).includes("fake-token"));
});

test("Nix build still runs and makes no upload call without authentication", () => {
  for (const env of [{}, { CACHIX_AUTH_TOKEN: "" }, { CACHIX_AUTH_TOKEN: " \n" }]) {
    const f = fixture(env);
    build({ cache: "fluentci" })();
    assert.deepEqual(
      commands(f).filter((args) => args[0] !== "'printf'"),
      [["'nix'", "'build'", "'--no-write-lock-file'", "'.#fluentci'"]],
    );
  }
});

test("invalid cache names fail before any build or upload commands", () => {
  for (const cache of ["", "--help", "a/b", "UPPER", "trailing-", "a".repeat(64)]) {
    const f = fixture({ CACHIX_AUTH_TOKEN: "fake-token" });
    assert.throws(() => build({ cache })(), /lowercase DNS label/);
    assert.deepEqual(commands(f), []);
  }
});

test("failed watched build never attempts to push the final result", () => {
  const f = fixture({ CACHIX_AUTH_TOKEN: "fake-token" });
  const host = globalThis.Host.getFunctions;
  globalThis.Host.getFunctions = () =>
    new Proxy(host(), {
      get: (target, name) =>
        name === "stdout"
          ? () => {
              throw new Error("Watched build failed");
            }
          : target[name],
    });
  assert.throws(() => build({ cache: "fluentci" })(), /Watched build failed/);
  assert.ok(!commands(f).some((args) => args.includes("'push'")));
});
