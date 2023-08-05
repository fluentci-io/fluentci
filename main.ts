import { Command } from "cliffy/command";
import run from "./run.ts";
import init from "./init.ts";
import search from "./search.ts";
import upgrade from "./upgrade.ts";
import listJobs from "./list.ts";

export async function main() {
  await new Command()
    .name("fluentci")
    .version("0.3.6")
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
    .arguments("<pipeline:string> [jobs...:string]")
    .option("-r, --reload", "Reload pipeline source cache")
    .action(function (options, pipeline, ...jobs: [string, ...Array<string>]) {
      run(pipeline, jobs, options.reload);
    })
    .command("init", "Initialize a new pipeline")
    .arguments("[pipeline-name:string]")
    .option("-t, --template <template>", "Initialize pipeline from template")
    .option(
      "-s, --standalone",
      "Initialize pipeline as standalone project, so it can be reused in other projects"
    )
    .action(async function (options, pipeline) {
      await init(options, pipeline);
    })
    .command("search", "Search for reusable pipelines")
    .option(
      "-l, --limit <limit:number>",
      "Limit the number of results, default: 100",
      { default: 100 }
    )
    .arguments("<query:string>")
    .action(async function (options, query) {
      await search(query, options);
    })
    .command("upgrade", "Upgrade FluentCI CLI to the latest version")
    .action(async () => {
      await upgrade();
    })
    .command("ls, list", "List all jobs in a pipeline")
    .arguments("<pipeline:string>")
    .action(async (_, pipeline) => {
      await listJobs(pipeline);
    })
    .parse(Deno.args);
}

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}
