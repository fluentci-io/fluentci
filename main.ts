import { Command } from "cliffy/command";
import run from "./src/cmd/run.ts";
import init from "./src/cmd/init.ts";
import search from "./src/cmd/search.ts";
import upgrade, { checkForUpdate } from "./src/cmd/upgrade.ts";
import listJobs from "./src/cmd/list.ts";
import docs from "./src/cmd/docs.ts";
import cache from "./src/cmd/cache.ts";
import doctor from "./src/cmd/doctor.ts";
import showEnvs from "./src/cmd/env.ts";
import login from "./src/cmd/login.ts";
import publish from "./src/cmd/publish.ts";
import startAgent, { listAgents } from "./src/cmd/agent.ts";
import whoami from "./src/cmd/whoami.ts";
import { brightGreen } from "./deps.ts";
import { VERSION } from "./src/consts.ts";
import repl from "./src/cmd/repl.ts";
import studio from "./src/cmd/studio.ts";
import * as projects from "./src/cmd/project.ts";
import server from "./src/cmd/server.ts";
import down from "./src/cmd/down.ts";
import up from "./src/cmd/up.ts";
import listServices from "./src/cmd/ps.ts";
import status from "./src/cmd/status.ts";

export async function main() {
  Deno.env.set(
    "PATH",
    `${Deno.env.get("HOME")}/.deno/bin:${Deno.env.get("PATH")}`
  );

  await new Command()
    .name("fluentci")
    .version(VERSION)
    .description(
      `
      .
          ______              __  _________
         / __/ /_ _____ ___  / /_/ ___/  _/
        / _// / // / -_) _ \\/ __/ /___/ /  
       /_/ /_/\\_,_/\\__/_//_/\\__/\\___/___/
       
      FluentCI CLI - An Open Source CI/CD tool written in TypeScript (Deno) based on Wasm Plugins and Dagger
             
      `
    )
    .arguments("[pipeline:string] [jobs...:string]")
    .option("-r, --reload", "Reload pipeline source cache")
    .option("-w, --wasm", "Run pipeline as WebAssembly Module")
    .option("--remote-exec", "Run pipeline on remote agent")
    .option("--work-dir <workDir:string>", "Set working directory")
    .option("-*, --* [args:string]", "Pass arguments to pipeline")
    .action(function (options, pipeline, ...jobs: [string, ...Array<string>]) {
      if (options.wasm) {
        Deno.args.findIndex((arg) => arg === pipeline);
        const args = Deno.args.slice(
          Deno.args.findIndex((arg) => arg === pipeline) + 1
        );
        run(pipeline || ".", args, options);
        return;
      }
      run(pipeline || ".", jobs, options);
    })
    .command("run", "Run a pipeline")
    .arguments("<pipeline:string> [jobs...:string]")
    .option("-r, --reload", "Reload pipeline source cache")
    .option("-w, --wasm", "Run pipeline as WebAssembly Module")
    .option("--remote-exec", "Run pipeline on remote agent")
    .option("--work-dir <workDir:string>", "Set working directory")
    .option("-*, --* [args:string]", "Pass arguments to pipeline")
    .action(function (options, pipeline, ...jobs: [string, ...Array<string>]) {
      if (pipeline.endsWith(".wasm") || pipeline.endsWith("?wasm=1")) {
        options.wasm = true;
      }

      if (options.wasm) {
        Deno.args.findIndex((arg) => arg === pipeline);
        const args = Deno.args.slice(
          Deno.args.findIndex((arg) => arg === pipeline) + 1
        );
        run(pipeline, args, options);
        return;
      }
      run(pipeline, jobs, options);
    })
    .command("init", "Initialize a new pipeline")
    .arguments("[pipeline-name:string]")
    .option("-t, --template <template>", "Initialize pipeline from template")
    .option(
      "-s, --standalone",
      "Initialize pipeline as standalone project, so it can be published and reused in other projects"
    )
    .option("-w, --wasm", "Initialize pipeline as WebAssembly Module")
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
    .command(
      "cache [pipeline:string]",
      "Cache remote dependencies of a pipeline"
    )
    .option("--lock-write", "Update lock file")
    .action(async function ({ lockWrite }, pipeline) {
      await cache(pipeline, lockWrite);
    })
    .command("ls, list", "List all jobs in a pipeline")
    .arguments("[pipeline:string]")
    .action(async (_, pipeline) => {
      await listJobs(pipeline);
    })
    .command("docs, man", "Show documentation for a pipeline")
    .arguments("[pipeline:string]")
    .action(async function (_, pipeline) {
      await docs(pipeline);
    })
    .command("doctor", "Check if FluentCI CLI is installed correctly")
    .action(async function () {
      await doctor();
    })
    .command(
      "env",
      `Show environment variables (read from ${brightGreen(
        ".fluentci/.env"
      )} file)`
    )
    .action(async function () {
      await showEnvs();
    })
    .command("login", "Login to FluentCI")
    .action(async function () {
      await login();
    })
    .command("publish", "Publish a pipeline to FluentCI Registry")
    .option("-w, --wasm", "Publish pipeline as WebAssembly Module")
    .action(async function (options) {
      await publish(options);
    })
    .command(
      "agent",
      new Command()
        .command("list", "List all agents")
        .alias("ls")
        .action(async function () {
          await listAgents();
        })
    )
    .description("Start FluentCI Runner Agent")
    .action(async function () {
      await startAgent();
    })
    .command("whoami", "Show current logged in user")
    .action(async function () {
      await whoami();
    })
    .command("repl", "Start FluentCI REPL")
    .arguments("[pipelines...:string]")
    .option("--debug", "Show more information for debugging")
    .action(async function (options, ...pipelines: [string, ...Array<string>]) {
      await repl(options, pipelines);
    })
    .command("studio", "Start FluentCI Studio, a web-based user interface")
    .option("--port <port:number>", "Port to run FluentCI Studio")
    .action(async function (options) {
      await studio(options);
    })
    .command(
      "project",
      new Command()
        .command("create", "Create a new project")
        .action(async function () {
          await projects.create();
        })
        .command("list", "List all projects")
        .action(async function () {
          await projects.list();
        })
        .command("show", "Show a project")
        .arguments("<name:string>")
        .action(async function (_, name) {
          await projects.show(name);
        })
        .command("export", "Export a project to a specific CI Provider")
        .arguments("[name:string]")
        .option("--github", "Export to GitHub Actions")
        .option("--azure", "Export to Azure Pipelines")
        .option("--gitlab", "Export to GitLab CI")
        .option("--circleci", "Export to CircleCI")
        .option("--aws", "Export to AWS CodePipeline")
        .action(async function (options, project) {
          await projects.exportActions(options, project);
        })
    )
    .description("Manage projects")
    .command("server", "Start FluentCI GraphQL Server")
    .option("--port <port:number>", "Port to run FluentCI Server")
    .action(function (options) {
      server(options);
    })
    .command("up", "Start services")
    .action(async function () {
      await up();
    })
    .command("down", "Stop services")
    .action(async function () {
      await down();
    })
    .command("ps", "List services")
    .action(async function () {
      await listServices();
    })
    .command("status", "Show status of a service")
    .arguments("<service:string>")
    .action(async function (_, service) {
      await status(service);
    })
    .globalOption("--check-update <checkUpdate:boolean>", "check for update", {
      default: true,
    })
    .globalAction(async (options: { checkUpdate: boolean }) => {
      await checkForUpdate(options);
    })
    .parse(Deno.args);
}

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}
