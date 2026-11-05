import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL(".", import.meta.url));
function command(program, args) {
  const result = spawnSync(program, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`${program} failed with exit status ${result.status}`);
}
command("clojure", ["-M:check"]);
command("clojure", ["-M:build"]);
mkdirSync(new URL("dist/", import.meta.url), { recursive: true });
await build({
  absWorkingDir: cwd,
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
