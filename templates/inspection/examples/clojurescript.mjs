import { buildPlugin, command } from "@fluentci/inspection";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const sdk = fileURLToPath(new URL("..", import.meta.url));
const demo = fileURLToPath(new URL(".", import.meta.url));
command("clojure", ["-M:check"], sdk);
command("clojure", ["-M:plugin"], sdk);
await buildPlugin({
  sdk: "clojurescript",
  root: demo,
  clojurescriptInterface: join(sdk, "dist/clojurescript-interface.json"),
});
