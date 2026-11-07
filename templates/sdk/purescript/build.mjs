import { buildPlugin } from "@fluentci/inspection";
import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function command(program, args) {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(`${program} failed with exit status ${result.status}`);
}
command("spago", ["build", "--purs-args", "--codegen js,docs,corefn"]);
mkdirSync("dist", { recursive: true });
await buildPlugin({ sdk: "purescript" });
