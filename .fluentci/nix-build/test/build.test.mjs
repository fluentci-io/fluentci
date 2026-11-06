import test from "node:test";
import assert from "node:assert/strict";
import { build } from "../output/CI.NixBuild/index.js";
import { fixture } from "../../cachix/test/host-fixture.mjs";

const commands = (f) =>
  f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));

test("Nix build uploads build paths and the final closure when authenticated", () => {
  const f = fixture({ CACHIX_AUTH_TOKEN: "fake-token" });
  build();
  const invocations = commands(f).filter((args) => args[0] === "'nix'");
  const prefix = [
    "'nix'",
    "'run'",
    "'--no-write-lock-file'",
    "'--inputs-from'",
    "'.'",
    "'nixpkgs#cachix'",
    "'--'",
  ];
  assert.deepEqual(invocations, [
    [
      ...prefix,
      "'watch-exec'",
      "'fluentci'",
      "'--'",
      "'nix'",
      "'build'",
      "'--no-write-lock-file'",
      "'.#fluentci'",
    ],
    [...prefix, "'push'", "'fluentci'", "'./result'"],
  ]);
  assert.ok(!JSON.stringify([f.calls, f.output]).includes("fake-token"));
});

test("Nix build still runs and makes no upload call without authentication", () => {
  const f = fixture();
  build();
  assert.deepEqual(
    commands(f).filter((args) => args[0] === "'nix'"),
    [["'nix'", "'build'", "'--no-write-lock-file'", "'.#fluentci'"]],
  );
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
  assert.throws(() => build(), /Watched build failed/);
  assert.ok(!commands(f).some((args) => args.includes("'push'")));
});
