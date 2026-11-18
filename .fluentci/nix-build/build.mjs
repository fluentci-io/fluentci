import { buildComponent } from "../scripts/build-component.mjs";
await buildComponent();

// Node host primitives remain external; all publisher policy is compiled from PureScript.
const { build } = await import("esbuild");
await build({
  entryPoints: ["run.mjs"],
  outfile: "dist/nix-cache-host.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["node:*"],
});
