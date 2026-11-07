import { spawnSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

// Resolve tools from each module's locked npm installation. Components expose
// the compiler-inspected PureScript surface; there is no manual export ABI.
export async function buildComponent() {
  const root = process.cwd();
  const require = createRequire(resolve(root, "package.json"));
  const { build } = await import(require.resolve("esbuild"));
  const result = spawnSync("spago", ["build"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`spago failed with exit status ${result.status}`);
  await mkdir(".sdk/wit", { recursive: true });
  await copyFile(
    new URL("../../engine/crates/components/wit/runtime.wit", import.meta.url),
    ".sdk/wit/runtime.wit",
  );
  await mkdir("dist", { recursive: true });
  // Retain the direct host-bridge bundle for packaging regression tests.
  await build({
    entryPoints: ["entry.mjs"],
    outfile: "dist/plugin.cjs",
    bundle: true,
    format: "cjs",
    platform: "neutral",
  });
  const { buildPlugin } = await import(require.resolve("@fluentci/inspection"));
  await buildPlugin({ sdk: "purescript", runtime: "component", root });
}
