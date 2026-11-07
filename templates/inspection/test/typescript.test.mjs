import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { inspectTypescript } from "../adapters/typescript.mjs";
import { wrapperSource } from "../wrappers.mjs";

async function fixture(t, source) {
  const root = await mkdtemp(join(tmpdir(), "fluentci-inspect-ts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = join(root, "entry.ts");
  await writeFile(entry, source);
  return { root, entry };
}

test("compiler inspection follows aliases, comments, optional fields, and inferred returns after source edits", async (t) => {
  const { root, entry } = await fixture(
    t,
    `
interface BuildArgs {
  /** Source directory. */
  src: string;
  jobs: number;
  verbose?: boolean;
  tags?: string[];
}
/** Build source files. */
export function build(args: BuildArgs) { return args.src + args.jobs; }
`,
  );
  const [first] = inspectTypescript(entry, root, ["build"]);
  assert.equal(first.returnType, "string");
  assert.equal(first.description, "Build source files.");
  assert.deepEqual(first.args[0], {
    name: "src",
    type: "string",
    description: "Source directory.",
  });
  assert.equal(first.args[2].required, false);
  await writeFile(
    entry,
    "export function build(args: { path: string; dryRun: boolean }): boolean { return args.dryRun; }",
  );
  const [second] = inspectTypescript(entry, root, ["build"]);
  assert.equal(second.returnType, "boolean");
  assert.deepEqual(
    second.args.map((arg) => arg.name),
    ["path", "dryRun"],
  );
});

test("generated wrapper validates before calling the typed handler and preserves literal JSON strings", async (t) => {
  const { root, entry } = await fixture(
    t,
    "export function build(args: { src: string; jobs: number }): string { return args.src + ':' + args.jobs; }",
  );
  const functions = inspectTypescript(entry, root, ["build"]);
  const generated = join(root, "wrapper.mjs");
  await writeFile(generated, wrapperSource(entry, functions));
  const result = await build({
    entryPoints: [generated],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "neutral",
  });
  let input = JSON.stringify({ src: "space ' quote $(ignored)", jobs: 3 }),
    output;
  const module = { exports: {} };
  new Function("module", "exports", "Host", result.outputFiles[0].text)(
    module,
    module.exports,
    {
      inputString: () => input,
      outputString: (value) => {
        output = value;
      },
    },
  );
  module.exports.build();
  assert.equal(output, "space ' quote $(ignored):3");
  input = JSON.stringify({ src: "demo", jobs: "three" });
  assert.throws(() => module.exports.build(), /jobs expects number/);
});

test("unresolved and untyped structured inputs fail instead of generating guessed signatures", async (t) => {
  const { root, entry } = await fixture(
    t,
    "export function build(args: { value: any }): string { return String(args.value); }",
  );
  assert.throws(
    () => inspectTypescript(entry, root, ["build"]),
    /Unsupported|unsupported/,
  );
});
