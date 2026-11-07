import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { componentContract, componentSource, witName } from "../components.mjs";
import { inspectTypescript } from "../adapters/typescript.mjs";

const fn = {
  name: "build_project",
  args: [
    { name: "source_dir", type: "string", description: "Source directory." },
    { name: "jobs", type: "integer", required: false },
  ],
  returnType: "string",
  description: "Build a project.",
  invoke: { style: "record", module: "./source.mjs", export: "build_project" },
};

test("WIT follows typed inputs, optional fields, return types and source docs", () => {
  const contract = componentContract([fn], "typescript");
  assert.match(contract.wit, /source-dir: string/);
  assert.match(contract.wit, /jobs: option<s32>/);
  assert.match(
    contract.wit,
    /build-project: func\(args: build-project-args\) -> string/,
  );
  assert.match(contract.wit, /\/\/\/ Source directory\./);
  const source = componentSource(contract.functions);
  assert.match(source, /args\["sourceDir"\]/);
  assert.match(source, /"source_dir"/);
  assert.doesNotMatch(source, /Host\.|extism/);
  assert.match(
    componentContract([{ ...fn, returnType: "number" }], "typescript").wit,
    /-> f64/,
  );
});

test("every compiler adapter maps its concrete native return types to WIT", () => {
  for (const [sdk, type, expected] of [
    ["purescript", "Effect String", "string"],
    ["gleam", "Result(String, String)", "result<string, string>"],
    ["rescript", "array<int>", "list<s32>"],
    ["clojurescript", "boolean", "bool"],
    ["typescript", "string[]", "list<string>"],
  ]) {
    assert.equal(
      componentContract([{ ...fn, returnType: type }], sdk).functions[0].result,
      expected,
    );
  }
  assert.throws(
    () => componentContract([{ ...fn, returnType: "any" }], "typescript"),
    /Unsupported/,
  );
  assert.throws(
    () =>
      componentContract([fn, { ...fn, name: "buildProject" }], "typescript"),
    /Duplicate WIT/,
  );
  assert.throws(() => witName("bad;name"), /Unsupported WIT/);
});

test("TypeScript compiler inspection regenerates WIT after source signature edits", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fluentci-component-types-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = join(root, "entry.ts");
  const code =
    "export function build(args: {src: string, jobs?: number}): string {return args.src}";
  await writeFile(entry, code);
  const inspect = () =>
    componentContract(
      inspectTypescript(entry, root, ["build"], true),
      "typescript",
    );
  assert.match(inspect().wit, /jobs: option<f64>/);
  await writeFile(entry, code.replace("jobs?: number", "verbose?: boolean"));
  assert.match(inspect().wit, /verbose: option<bool>/);
  assert.doesNotMatch(inspect().wit, /jobs:/);
});
