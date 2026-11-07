import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { inspectTypescript } from "./adapters/typescript.mjs";
import { inspectPurescript } from "./adapters/purescript.mjs";
import { inspectGleam } from "./adapters/gleam.mjs";
import { inspectRescript } from "./adapters/rescript.mjs";
import { inspectClojurescript } from "./adapters/clojurescript.mjs";
import { publicMetadata } from "./common.mjs";
import { wrapperSource } from "./wrappers.mjs";
import { buildComponent } from "./components.mjs";
import { embedInspection } from "./wasm.mjs";

export function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`${program} failed with exit status ${result.status}`);
}

export async function buildPlugin({
  sdk,
  runtime = "extism",
  root = process.cwd(),
  entry = sdk === "typescript" ? "entry.ts" : "entry.mjs",
  output = "dist/plugin.wasm",
  imports = "imports.d.ts",
  gleamInterface = "dist/gleam-interface.json",
  clojurescriptInterface = "dist/clojurescript-interface.json",
}) {
  if (!["extism", "component"].includes(runtime))
    throw Error(`Unknown runtime ${runtime}`);
  root = resolve(root);
  entry = resolve(root, entry);
  const artifact = resolve(root, output);
  const directory = dirname(artifact);
  await mkdir(directory, { recursive: true });
  // esbuild inspects the real entry export surface without importing or running it.
  const exports = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    metafile: true,
    external: runtime === "component" ? ["fluentci:dependency/*"] : [],
    outfile: join(directory, "surface.js"),
  });
  const names = Object.values(exports.metafile.outputs)
    .flatMap((output) => output.exports)
    .sort();
  if (!names.length || names.some((name) => name === "default"))
    throw Error("Expose named module functions from the entrypoint");
  let inspected;
  if (sdk === "typescript")
    inspected = inspectTypescript(entry, root, names, runtime === "component");
  else if (sdk === "purescript")
    inspected = inspectPurescript(entry, root, names, runtime === "component");
  else if (sdk === "gleam")
    inspected = inspectGleam(
      entry,
      root,
      names,
      resolve(root, gleamInterface),
      runtime === "component",
    );
  else if (sdk === "rescript")
    inspected = inspectRescript(
      entry,
      root,
      names,
      undefined,
      runtime === "component",
    );
  else if (sdk === "clojurescript")
    inspected = inspectClojurescript(
      entry,
      root,
      names,
      resolve(root, clojurescriptInterface),
      runtime === "component",
    );
  else throw Error(`No compiler inspection adapter for ${sdk}`);
  if (runtime === "component")
    return buildComponent({ root, artifact, functions: inspected, sdk });
  const generated = join(directory, ".fluentci-entry.mjs");
  await writeFile(generated, wrapperSource(entry, inspected));
  const javascript = join(directory, "plugin.js");
  await build({
    absWorkingDir: root,
    entryPoints: [generated],
    outfile: javascript,
    bundle: true,
    format: "cjs",
    platform: "neutral",
    target: "es2020",
  });
  const metadata = publicMetadata(inspected);
  // Export declarations follow the generated wrappers, so source edits cannot leave
  // a hand-maintained imports.d.ts list out of sync with the Wasm export surface.
  const sourceImports = resolve(root, imports);
  const { readFile } = await import("node:fs/promises");
  const declarations = (await readFile(sourceImports, "utf8")).replace(
    /declare module ["']main["']\s*\{[^}]*\}/s,
    `declare module "main" { ${names.map((name) => `export function ${name}(): I32;`).join(" ")} }`,
  );
  const generatedImports = join(directory, ".fluentci-imports.d.ts");
  await writeFile(generatedImports, declarations);
  command(
    "extism-js",
    [javascript, "-i", generatedImports, "-o", artifact],
    root,
  );
  return embedInspection(artifact, metadata);
}
