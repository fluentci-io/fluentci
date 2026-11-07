import { buildPlugin } from "@fluentci/inspection";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function command(program, args) {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`${program} failed with exit status ${result.status}`);
}
command("gleam", ["build", "--target", "javascript"]);
mkdirSync("dist", { recursive: true });
command("gleam", [
  "export",
  "package-interface",
  "--out",
  "dist/gleam-interface.json",
]);
await buildPlugin({ sdk: "gleam", runtime: "component" });
