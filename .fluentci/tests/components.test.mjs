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
  "cache",
];

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());

// Assert generated interface fields against the declared cache contract,
// including nested environment records and Boolean transfer hits.
function assertRecord(wit, name, schema) {
  const body = wit.match(new RegExp(`record %?${name}\\s*\\{([^}]*)\\}`));
  assert.ok(body, `missing WIT record ${name}`);
  const expected = Object.entries(schema.properties).map(([key, value]) => {
    const field = kebab(key);
    let type;
    if (value.type === "array") {
      if (value.items.type === "object") {
        const nested = `${name}-${field}-item`;
        assertRecord(wit, nested, value.items);
        type = `list<${nested}>`;
      } else type = `list<${value.items.type}>`;
    } else type = value.type === "boolean" ? "bool" : value.type;
    return `${field}: ${type}`;
  });
  const actual = body[1].split(",").map((field) => field.trim()).filter(Boolean);
  assert.deepEqual(actual.sort(), expected.sort());
}

for (const module of modules) {
  test(`${module} exposes a real component ABI with synchronized typed help`, async () => {
    const directory = new URL(`${module}/dist/`, root);
    const bytes = await readFile(new URL("plugin.wasm", directory));
    assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 13, 0, 1, 0]);
    // jco prints only the root package: named interface definitions are omitted.
    // Check compiled world linkage here and generated interface fields below.
    // The Rust ABI test inspects the binary's full types against its metadata.
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
    const schema = module === "cache"
      ? JSON.parse(await readFile(new URL("cache/schema.json", root), "utf8"))
      : undefined;
    if (schema) assert.deepEqual(
      metadata.functions.map((fn) => fn.name).sort(),
      Object.keys(schema.exports).map(kebab).sort(),
    );
    for (const fn of metadata.functions) {
      assert.equal(fn.inputFormat, "wit");
      const declared = schema && Object.entries(schema.exports)
        .find(([name]) => kebab(name) === fn.name)[1];
      const result = declared ? `${fn.name}-result` : "unit";
      assert.equal(fn.returnType, result);
      if (declared) {
        assertRecord(generatedWit, result, declared.output);
        assert.match(generatedWit, new RegExp(`%?${fn.name}: func\\([^;]*\\) -> ${result};`));
        assert.equal(fn.args.length, Object.keys(declared.input.properties).length);
      }
      assert.ok(fn.description?.trim(), `${module}.${fn.name} needs help text`);
      assert.match(generatedWit, new RegExp(`%?${fn.name}: func\\(`));
      for (const arg of fn.args) {
        const property = declared && Object.entries(declared.input.properties)
          .find(([name]) => kebab(name) === arg.name);
        const expectedType = property ? property[1].type : "string";
        assert.equal(arg.type, expectedType);
        const required = declared ? declared.input.required.includes(property[0]) : true;
        assert.equal(arg.required !== false, required);
        assert.ok(
          arg.description?.trim(),
          `${module}.${fn.name} --${arg.name} needs help text`,
        );
        const scalar = expectedType === "boolean" ? "bool" : expectedType;
        const type = required ? scalar : `option<${scalar}>`;
        assert.match(generatedWit, new RegExp(`${arg.name}: ${type}`));
      }
    }
  });
}
