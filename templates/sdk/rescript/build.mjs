import { buildPlugin, command } from "@fluentci/inspection";

command("rescript", [], process.cwd());
await buildPlugin({ sdk: "rescript" });
