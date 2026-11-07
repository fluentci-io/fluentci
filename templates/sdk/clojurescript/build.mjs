import { buildPlugin, command } from "@fluentci/inspection";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL(".", import.meta.url));
command("clojure", ["-M:check"], cwd);
command("clojure", ["-M:build"], cwd);
await buildPlugin({ sdk: "clojurescript", root: cwd });
