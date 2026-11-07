import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  dependencyInterfaces,
  addDependencyInterfaces,
} from "../dependencies.mjs";
import { programFor } from "../adapters/typescript.mjs";

test("dependency WIT imports retain qualified identities without alias annotations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fluentci-imports-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await dependencyInterfaces(root), []);
  await mkdir(join(root, ".fluentci/dependencies"), { recursive: true });
  const dependency = {
    alias: "math",
    import: "fluentci:dependency-math/math@0.1.0",
    export: "fluentci:module/api@0.1.0",
    wit: "package fluentci:dependency-math@0.1.0; interface math { add: func(left: u32, right: u32) -> u32; }",
  };
  await writeFile(
    join(root, ".fluentci/dependencies/interfaces.json"),
    JSON.stringify([dependency]),
  );
  const output = join(root, "wit");
  const wit = await addDependencyInterfaces(
    root,
    output,
    "package example:module; world plugin { export api; }",
  );
  assert.match(wit, /import fluentci:dependency-math\/math@0.1.0;/);
  assert.doesNotMatch(wit, /import math:/);
  assert.equal(
    await readFile(join(output, "deps/dependency-math/dependency.wit"), "utf8"),
    dependency.wit,
  );
});

test("installed declarations provide real editor completions and reject invalid argument types", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "fluentci-dependency-types-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "fluentci_modules"));
  await writeFile(
    join(root, "fluentci_modules/imports.d.ts"),
    'declare module "fluentci:dependency/math" {\n/** Add two numbers. */\nexport function add(args: {left: number; right: number}): number; }',
  );
  const entry = join(root, "entry.ts");
  await writeFile(
    entry,
    'import { add } from "fluentci:dependency/math"; export const answer = add({left: 20, right: 22});',
  );
  const { checker, source } = programFor(entry, root);
  const symbol = checker.getSymbolAtLocation(
    source.statements[0].importClause.namedBindings.elements[0].name,
  );
  const actual = checker.getAliasedSymbol(symbol);
  assert.equal(actual.name, "add");
  assert.equal(
    actual.getDocumentationComment(checker)[0].text,
    "Add two numbers.",
  );
  const call = source.statements[1].declarationList.declarations[0].initializer;
  assert.equal(checker.typeToString(checker.getTypeAtLocation(call)), "number");
  await writeFile(
    entry,
    'import { add } from "fluentci:dependency/math"; add({left: "wrong", right: 22});',
  );
  assert.throws(
    () => programFor(entry, root),
    /not assignable to type 'number'/,
  );
});
