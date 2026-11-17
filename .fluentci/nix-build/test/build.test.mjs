import test from "node:test";
import assert from "node:assert/strict";
import { build } from "../output/CI.NixBuild/index.js";
import { fixture } from "./host-fixture.mjs";

test("component invokes the host helper without credential arguments", () => {
  const f = fixture();
  build();
  const commands = f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));
  assert.deepEqual(commands[0], ["'node'", "'.fluentci/nix-build/run.mjs'"]);
});
