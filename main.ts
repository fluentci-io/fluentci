import { Command } from "cliffy/command";
import run from "./run.ts";

export async function main() {
  await new Command()
    .name("fluentci")
    .version("0.1.0")
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
    .parse(Deno.args);
}

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}
