import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url);
const require = createRequire(new URL("main/package.json", root));
const { componentWit } = await import(require.resolve("@bytecodealliance/jco"));
const modules = [
  "main",
  "rust",
  "studio",
  "release",
  "nix",
  "desktop",
  "nix-build",
  "cachix",
];

for (const module of modules) {
  test(`${module} exposes a real component ABI with synchronized typed help`, async () => {
    const directory = new URL(`${module}/dist/`, root);
    const bytes = await readFile(new URL("plugin.wasm", directory));
    assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 13, 0, 1, 0]);
    // Decode the compiled artifact rather than trusting the generated WIT file.
    const wit = await componentWit(bytes);
    assert.match(wit, /fluentci:runtime\/api@0\.1\.0/);
    assert.doesNotMatch(wit, /extism/i);
    assert.match(wit, /export fluentci:module\/api@0\.1\.0/);
    const generatedWit = await readFile(
      new URL("wit/module.wit", directory),
      "utf8",
    );
    const metadata = JSON.parse(
      await readFile(new URL("fluentci.metadata.json", directory), "utf8"),
    );
    assert.equal(
      metadata.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.ok(metadata.functions.length > 0);
    for (const fn of metadata.functions) {
      assert.equal(fn.inputFormat, "wit");
      assert.equal(fn.returnType, "unit"); // These CI jobs perform effects and return ().
      assert.ok(fn.description?.trim(), `${module}.${fn.name} needs help text`);
      assert.match(generatedWit, new RegExp(`%?${fn.name}: func\\(`));
      for (const arg of fn.args) {
        assert.equal(arg.type, "string");
        assert.ok(
          arg.description?.trim(),
          `${module}.${fn.name} --${arg.name} needs help text`,
        );
        assert.match(generatedWit, new RegExp(`${arg.name}: string`));
      }
    }
  });
}
