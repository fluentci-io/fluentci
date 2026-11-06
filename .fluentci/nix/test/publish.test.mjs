import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "../../cachix/test/host-fixture.mjs";
import { flakehub, flakestry } from "../output/CI.Nix/index.js";

// Exercise the compiled PureScript with a host stub, without launching FluentCI
// or Nix, reading credentials, or making publication requests.
test("FlakeHub passes the selected tag as a literal command argument", () => {
  const f = fixture({ RELEASE_VERSION: "v0.17.0" });
  flakehub();
  const commands = f.calls
    .filter(([name]) => name === "with_exec")
    .map(([, value]) => JSON.parse(value));
  assert.deepEqual(commands[0], [
    "'flakehub-push'",
    "'--visibility'",
    "'public'",
    "'--name'",
    "'fluentci-io/fluentci'",
    "'--tag'",
    "'v0.17.0'",
  ]);
});

test("missing publisher configuration fails before creating a pipeline", () => {
  for (const value of [undefined, ""]) {
    const f = fixture(value === undefined ? {} : { RELEASE_VERSION: value });
    assert.throws(() => flakehub(), /RELEASE_VERSION/);
    assert.ok(!f.calls.some(([name]) => name === "pipeline"));
  }
  const env = {
    VERSION: "v0.17.0",
    REF: "a".repeat(40),
    GH_TOKEN: "github-test-token",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-test-token",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/token?x=1",
  };
  for (const key of Object.keys(env)) {
    for (const value of [undefined, ""]) {
      const candidate = { ...env };
      if (value === undefined) delete candidate[key];
      else candidate[key] = value;
      const f = fixture(candidate);
      assert.throws(() => flakestry(), new RegExp(key));
      assert.ok(!f.calls.some(([name]) => name === "pipeline"));
    }
  }
});

test("Flakestry uses the registry payload keys and audience without embedding secrets", () => {
  const env = {
    VERSION: "v0.17.0",
    REF: "a".repeat(40),
    GH_TOKEN: "github-test-token",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc-test-token",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/token?x=1",
  };
  const f = fixture(env);
  flakestry();
  const serialized = JSON.stringify(f.calls);
  assert.ok(serialized.includes("metadata_errors="));
  assert.ok(serialized.includes("outputs_errors="));
  assert.ok(serialized.includes("audience=https://flakestry.dev"));
  assert.ok(serialized.includes("https://flakestry.dev/api/publish"));
  assert.ok(!serialized.includes(env.GH_TOKEN));
  assert.ok(!serialized.includes(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN));
});
