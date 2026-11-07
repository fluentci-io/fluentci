import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function adapter(api) {
  const schema = JSON.parse(
    await readFile(new URL("../component-host-schema.json", import.meta.url)),
  );
  const key = `__fluentciWitTest${Math.random()}`;
  globalThis[key] = api;
  const source = (
    await readFile(new URL("../component-host.mjs", import.meta.url), "utf8")
  )
    .replace(
      'import * as api from "fluentci:runtime/api@0.1.0";',
      `const api = globalThis[${JSON.stringify(key)}];`,
    )
    .replace(
      'import { log } from "fluentci:runtime/host@0.1.0";',
      "const log = () => {};",
    )
    .replace(
      'import schema from "./component-host-schema.json";',
      `const schema = ${JSON.stringify(schema)};`,
    );
  try {
    return {
      module: await import(
        `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
      ),
      schema,
    };
  } finally {
    delete globalThis[key];
  }
}

test("all SDK host operations use typed imports and preserve environment pairs", async () => {
  const calls = [];
  const { module, schema } = await adapter({
    setEnvs: (input) => calls.push(input),
    getEnv: (name) => `value:${name}`,
    hasEnv: () => true,
  });
  assert.deepEqual(
    Object.keys(module.Host.getFunctions()).sort(),
    Object.keys(schema.operations).sort(),
  );
  module.invoke("set_envs", JSON.stringify([["LITERAL", "space ' 😀"]]));
  assert.deepEqual(calls, [[["LITERAL", "space ' 😀"]]]);
  const input = module.Memory.fromString("LITERAL");
  const output = module.Host.getFunctions().get_env(input.offset);
  assert.equal(module.Memory.find(output).readString(), "value:LITERAL");
  assert.equal(module.invoke("has_env", "LITERAL"), "true");
  assert.throws(() => module.Memory.find(output), /Invalid SDK value handle/);
});

test("typed plan conversion preserves defaults, variants, maps and nullable report fields", async () => {
  let plan;
  const { module, schema } = await adapter({
    executePlan: (input, directory) => {
      plan = input;
      assert.equal(directory, "fresh-run");
      return module.convert(
        schema.operations.execute_plan.output,
        {
          outcome: "succeeded",
          tasks: [
            {
              id: "digest",
              status: "succeeded",
              exit_code: null,
              signal: null,
              file_result: null,
              error: null,
              duration_ms: 1,
              stdout: "out",
              stderr: "err",
              probe_logs: null,
              cache: {
                outcome: "disabled",
                key: null,
                reason: "disabled",
                components: {},
              },
              wait_reason: null,
              attempts: [],
              outputs: {},
              artifacts: {},
              condition_skipped: false,
              allowed_failure: false,
            },
          ],
        },
        true,
      );
    },
  });
  const report = JSON.parse(
    module.invoke(
      "execute_plan",
      JSON.stringify({
        plan: {
          version: 1,
          tasks: [
            {
              id: "digest",
              program: "",
              cwd: ".",
              env: { LITERAL: "value" },
              primitive: {
                kind: "digest",
                algorithm: "sha256",
                input: { source: "text", value: "abc" },
              },
            },
          ],
        },
        run_dir: "fresh-run",
      }),
    ),
  );
  assert.equal(plan.version, 1);
  assert.equal(plan.jobs, undefined);
  assert.deepEqual(plan.tasks[0].env, [["LITERAL", "value"]]);
  assert.equal(plan.tasks[0].primitive.tag, "digest");
  assert.deepEqual(plan.tasks[0].primitive.val.input, {
    tag: "text",
    val: "abc",
  });
  assert.equal(report.tasks[0].exit_code, null);
  assert.equal(report.tasks[0].duration_ms, 1);
});

test("integer adapters reject lossy conversions", async () => {
  const { module } = await adapter({});
  const type = { kind: "scalar", type: "u64" };
  assert.equal(module.convert(type, 42, true), 42n);
  assert.throws(
    () => module.convert(type, Number.MAX_SAFE_INTEGER + 1, true),
    /exact/,
  );
  assert.throws(() => module.convert(type, 2n ** 63n, false), /exactly/);
  assert.throws(() => module.convert(type, -1, true), /range/);
});
