import { Command } from "cliffy/command";
import run from "./run.ts";
import init from "./init.ts";
import search from "./search.ts";
import upgrade from "./upgrade.ts";

export async function main() {
  await new Command()
    .name("fluentci")
    .version("0.2.5")
    .description(
      `
      .
          ______              __  _________
         / __/ /_ _____ ___  / /_/ ___/  _/
        / _// / // / -_) _ \\/ __/ /___/ /  
       /_/ /_/\\_,_/\\__/_//_/\\__/\\___/___/
       
      FluentCI CLI - An Open Source CI/CD tool written in TypeScript (Deno) based on Dagger
             
      `
    )
    .arguments("<pipeline:string>")
    .action(function (_, pipeline) {
      run(pipeline);
    })
    .command("init", "Initialize a new pipeline")
    .arguments("[pipeline-name:string]")
    .option("-t, --template <template>", "Initialize pipeline from template")
    .option(
      "-s, --standalone",
      "Initialize pipeline as standalone project, so it can be reused in other projects"
    )
    .action(async function (_, pipeline) {
      await init(pipeline);
    })
    .command("search", "Search for reusable pipelines")
    .arguments("<query:string>")
    .action(async function (_, query) {
      await search(query);
    })
    .command("upgrade", "Upgrade FluentCI CLI to the latest version")
    .action(async () => {
      await upgrade();
    })
    .parse(Deno.args);
}

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}
