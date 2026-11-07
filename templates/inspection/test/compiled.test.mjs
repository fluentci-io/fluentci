import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPurescript } from "../adapters/purescript.mjs";
import { inspectGleam } from "../adapters/gleam.mjs";
import { inspectRescript } from "../adapters/rescript.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "fluentci-inspection-compiler-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function compile(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || String(result.error),
  );
}

const rescript = process.env.RESCRIPT_BIN ?? "rescript";
const rescriptTools = process.env.RESCRIPT_TOOLS ?? "rescript-tools";
test(
  "ReScript compiler docs preserve int/float, optional fields, and native return types",
  { skip: spawnSync(rescript, ["--version"]).status !== 0 },
  async (t) => {
    const root = await fixture(t);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "rescript.json"),
      JSON.stringify({
        name: "inspection_fixture",
        sources: ["src"],
        "package-specs": { module: "esmodule", "in-source": true },
        suffix: ".res.mjs",
      }),
    );
    const source = join(root, "src/Fixture.res");
    const entry = join(root, "entry.mjs");
    const code = `type args = {/** Source directory. */ src: string, jobs: int, verbose?: bool}
/** Build source files. */
let build = (args: args): string => args.src
`;
    await writeFile(source, code);
    await writeFile(entry, 'export { build } from "./src/Fixture.res.mjs";');
    compile(rescript, [], root);
    const [first] = inspectRescript(entry, root, ["build"], rescriptTools);
    assert.equal(first.returnType, "string");
    assert.equal(first.args[0].description, "Source directory.");
    assert.equal(first.args[1].type, "integer");
    assert.equal(first.args[2].required, false);
    await writeFile(source, code.replace("jobs: int", "jobs: float"));
    compile(rescript, [], root);
    assert.equal(
      inspectRescript(entry, root, ["build"], rescriptTools)[0].args[1].type,
      "number",
    );
  },
);

test(
  "PureScript compiler docs and CoreFn regenerate input fields and return types",
  { skip: spawnSync("purs", ["--version"]).status !== 0 },
  async (t) => {
    const root = await fixture(t);
    const source = join(root, "Fixture.purs");
    const entry = join(root, "entry.mjs");
    await writeFile(
      entry,
      'export { build } from "./output/Fixture/index.js";',
    );
    const code = `module Fixture where
type Args = { src :: String, jobs :: Int }
-- | Build source files.
-- | @param src Source directory.
build :: Args -> String
build args = args.src
`;
    await writeFile(source, code);
    compile(
      "purs",
      ["compile", source, "--codegen", "js,docs,corefn", "-o", "output"],
      root,
    );
    const [first] = inspectPurescript(entry, root, ["build"]);
    assert.equal(first.returnType, "String");
    assert.equal(first.description, "Build source files.");
    assert.equal(first.args.find((arg) => arg.name === "jobs").type, "integer");
    assert.equal(
      first.args.find((arg) => arg.name === "src").description,
      "Source directory.",
    );
    await writeFile(source, code.replace("jobs :: Int", "jobs :: Number"));
    compile(
      "purs",
      ["compile", source, "--codegen", "js,docs,corefn", "-o", "output"],
      root,
    );
    const [second] = inspectPurescript(entry, root, ["build"]);
    assert.equal(second.args.find((arg) => arg.name === "jobs").type, "number");
  },
);

test(
  "Gleam package interface follows native record fields, aliases, and return types",
  { skip: spawnSync("gleam", ["--version"]).status !== 0 },
  async (t) => {
    const root = await fixture(t);
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "gleam.toml"),
      'name = "inspection_fixture"\nversion = "1.0.0"\ntarget = "javascript"\n',
    );
    const code = `pub type Args { Args(src: String, jobs: Int) }
pub type Input = Args
/// Build source files.
/// @param src Source directory.
pub fn build(args: Input) -> String { args.src }
`;
    await writeFile(join(root, "src/fixture.gleam"), code);
    const entry = join(root, "entry.mjs");
    await writeFile(
      entry,
      'export { build } from "./build/dev/javascript/inspection_fixture/fixture.mjs";',
    );
    compile("gleam", ["build", "--target", "javascript"], root);
    compile(
      "gleam",
      ["export", "package-interface", "--out", "interface.json"],
      root,
    );
    const [first] = inspectGleam(
      entry,
      root,
      ["build"],
      join(root, "interface.json"),
    );
    assert.equal(first.returnType, "String");
    assert.equal(first.description, "Build source files.");
    assert.equal(first.args[0].description, "Source directory.");
    assert.equal(first.args[1].type, "integer");
    await writeFile(
      join(root, "src/fixture.gleam"),
      code.replace("jobs: Int", "jobs: Float"),
    );
    compile("gleam", ["build", "--target", "javascript"], root);
    compile(
      "gleam",
      ["export", "package-interface", "--out", "interface.json"],
      root,
    );
    assert.equal(
      inspectGleam(entry, root, ["build"], join(root, "interface.json"))[0]
        .args[1].type,
      "number",
    );
  },
);
