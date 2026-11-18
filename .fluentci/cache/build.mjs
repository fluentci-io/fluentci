import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { buildComponent } from "../scripts/build-component.mjs";
function run(program, args) {
  const r = spawnSync(program, args, { stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(`${program} failed (${r.status})`);
}
run("spago", ["build"]);
await mkdir("dist", { recursive: true });
const result = await build({
  entryPoints: ["host.mjs"],
  bundle: true,
  minify: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["node:*"],
  banner: {
    js: "import {createRequire} from 'node:module';const require=createRequire(process.cwd()+'/fluentci-cache-host.cjs');",
  },
});
const host = result.outputFiles[0].text;
await writeFile("dist/cache-host.mjs", host);
await writeFile(
  "dist/embedded-host.mjs",
  `export const hostProgram=${JSON.stringify(gzipSync(host).toString("base64"))};\n`,
);
await buildComponent();
