import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPurescript } from "../adapters/purescript.mjs";
import { componentContract } from "../components.mjs";

const con = (module, name) => ({
  tag: "TypeConstructor",
  contents: [module.split("."), name],
});
const app = (head, value) => ({ tag: "TypeApp", contents: [head, value] });
const parens = (contents) => ({ tag: "ParensInType", contents });
const record = (fields) =>
  app(
    con("Prim", "Record"),
    Object.entries(fields).reduceRight(
      (tail, [label, value]) => ({
        tag: "RCons",
        contents: [label, value, tail],
      }),
      { tag: "REmpty" },
    ),
  );

function fixture(t, returned) {
  const root = mkdtempSync(join(tmpdir(), "fluentci-purs-return-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entry = join(root, "entry.mjs");
  writeFileSync(entry, 'export { build } from "./output/Fixture/index.js";');
  const declarations = [
    {
      title: "Input",
      info: {
        declType: "typeSynonym",
        arguments: [],
        type: parens(
          record({
            path: parens(con("Prim", "String")),
            optional: parens(
              app(con("Data.Maybe", "Maybe"), parens(con("Prim", "Boolean"))),
            ),
          }),
        ),
      },
    },
    {
      title: "Reply",
      info: {
        declType: "typeSynonym",
        arguments: [["a", null]],
        type: parens(
          record({
            value: { tag: "TypeVar", contents: "a" },
            environment: app(
              parens(con("Prim", "Array")),
              parens(record({ from: con("Prim", "String") })),
            ),
          }),
        ),
      },
    },
  ];
  for (const [name, values] of [
    ["Types", declarations],
    [
      "Fixture",
      [
        {
          title: "build",
          comments: "Build cached outputs.\n@param path Cache path.",
          info: {
            declType: "value",
            type: parens(
              app(
                app(
                  parens(con("Prim", "Function")),
                  parens(con("Types", "Input")),
                ),
                parens(app(parens(con("Effect", "Effect")), returned)),
              ),
            ),
          },
        },
      ],
    ],
  ]) {
    const directory = join(root, "output", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "index.js"), "");
    writeFileSync(
      join(directory, "docs.json"),
      JSON.stringify({ name, declarations: values }),
    );
    writeFileSync(
      join(directory, "corefn.json"),
      JSON.stringify({ exports: ["build"] }),
    );
  }
  return inspectPurescript(entry, root, ["build"], true);
}

test("parenthesized effect records resolve to native WIT records", (t) => {
  const functions = fixture(
    t,
    parens(record({ outcome: parens(con("Prim", "String")) })),
  );
  assert.equal(
    functions[0].args.find((arg) => arg.name === "path").type,
    "string",
  );
  assert.equal(
    functions[0].args.find((arg) => arg.name === "optional").required,
    false,
  );
  const contract = componentContract(functions, "purescript");
  assert.equal(contract.functions[0].result, "build-result");
  assert.match(contract.wit, /outcome: string/);
  assert.match(contract.wit, /build: func\(args: build-args\) -> build-result/);
});

test("parameterized return aliases preserve nested record lists and keyword fields", (t) => {
  const functions = fixture(
    t,
    parens(app(con("Types", "Reply"), parens(con("Prim", "String")))),
  );
  const contract = componentContract(functions, "purescript");
  assert.match(contract.wit, /value: string/);
  assert.match(
    contract.wit,
    /environment: list<build-result-environment-item>/,
  );
  assert.match(contract.wit, /%from: string/);
  assert.doesNotMatch(functions[0].returnType, /Reply/);
});

test("parenthesized scalar options and lists retain their existing contracts", (t) => {
  const option = componentContract(
    fixture(
      t,
      parens(app(con("Data.Maybe", "Maybe"), parens(con("Prim", "String")))),
    ),
    "purescript",
  );
  assert.equal(option.functions[0].result, "option<string>");
  const list = componentContract(
    fixture(
      t,
      parens(app(parens(con("Prim", "Array")), parens(con("Prim", "Int")))),
    ),
    "purescript",
  );
  assert.equal(list.functions[0].result, "list<s32>");
});
