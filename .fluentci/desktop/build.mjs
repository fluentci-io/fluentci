import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { validateExports } from "./validate-exports.mjs";
import { spawnSync } from "node:child_process";
function command(program, args) {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`${program} failed with exit status ${result.status}`);
}
command("spago", ["build"]);
validateExports(await import("./entry.mjs"));
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["entry.mjs"],
  outfile: "dist/plugin.js",
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: "es2020",
});
command("extism-js", [
  "dist/plugin.js",
  "-i",
  "imports.d.ts",
  "-o",
  "dist/plugin.wasm",
]);
