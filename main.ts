import { Command } from "cliffy/command";
import run from "./src/cmd/run.ts";
import init from "./src/cmd/init.ts";
import search from "./src/cmd/search.ts";
import upgrade from "./src/cmd/upgrade.ts";
import listJobs from "./src/cmd/list.ts";
import generateWorkflow from "./src/cmd/github.ts";
import generateGitlabCIConfig from "./src/cmd/gitlab.ts";
import generateAWSCodePipelineConfig from "./src/cmd/aws.ts";
import generateAzurePipelinesConfig from "./src/cmd/azure.ts";
import generateCircleCIConfig from "./src/cmd/circleci.ts";
import docs from "./src/cmd/docs.ts";
import cache from "./src/cmd/cache.ts";
import doctor from "./src/cmd/doctor.ts";
import showEnvs from "./src/cmd/env.ts";
import login from "./src/cmd/login.ts";
import publish from "./src/cmd/publish.ts";
import startAgent, { listAgents } from "./src/cmd/agent.ts";
import whoami from "./src/cmd/whoami.ts";
import { brightGreen } from "./deps.ts";

export async function main() {
  await new Command()
    .name("fluentci")
    .version("0.10.7")
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
    .arguments("[pipeline:string] [jobs...:string]")
    .option("-r, --reload", "Reload pipeline source cache")
    .option("-*, --* <args:string>", "Pass arguments to pipeline")
    .action(function (options, pipeline, ...jobs: [string, ...Array<string>]) {
      run(pipeline || ".", jobs, options);
    })
    .command("run", "Run a pipeline")
    .arguments("<pipeline:string> [jobs...:string]")
    .option("-r, --reload", "Reload pipeline source cache")
    .option("-*, --* <args:string>", "Pass arguments to pipeline")
    .action(function (options, pipeline, ...jobs: [string, ...Array<string>]) {
      run(pipeline, jobs, options);
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
    .command(
      "gh, github",
      new Command()
        .command("init", "Initialize a new GitHub Actions workflow")
        .option(
          "-t, --template <template>",
          "Initialize GitHub Action workflow from template"
        )
        .option("-r, --reload", "Reload pipeline source cache")
        .action(async function ({ template, reload }) {
          await generateWorkflow(template, reload);
        })
    )
    .description("GitHub Actions integration")
    .action(function () {
      this.showHelp();
    })
    .command(
      "gl, gitlab",
      new Command()
        .command("init", "Initialize a new GitLab CI configuration")
        .option(
          "-t, --template <template>",
          "Initialize GitLab CI from template"
        )
        .option("-r, --reload", "Reload pipeline source cache")
        .action(async function ({ template, reload }) {
          await generateGitlabCIConfig(template, reload);
        })
    )
    .description("GitLab CI integration")
    .action(function () {
      this.showHelp();
    })
    .command(
      "cci, circleci",
      new Command()
        .command("init", "Initialize a new CircleCI configuration")
        .option(
          "-t, --template <template>",
          "Initialize CircleCI from template"
        )
        .option("-r, --reload", "Reload pipeline source cache")
        .action(async function ({ template, reload }) {
          await generateCircleCIConfig(template, reload);
        })
    )
    .description("CircleCI integration")
    .action(function () {
      this.showHelp();
    })
    .command(
      "ap, azure",
      new Command()
        .command("init", "Initialize a new Azure Pipelines configuration")
        .option(
          "-t, --template <template>",
          "Initialize Azure Pipelines from template"
        )
        .option("-r, --reload", "Reload pipeline source cache")
        .action(async function ({ template, reload }) {
          await generateAzurePipelinesConfig(template, reload);
        })
    )
    .description("Azure Pipelines integration")
    .action(function () {
      this.showHelp();
    })
    .command(
      "ac, aws",
      new Command()
        .command("init", "Initialize a new AWS CodePipeline configuration")
        .option(
          "-t, --template <template>",
          "Initialize AWS CodePipeline from template"
        )
        .option("-r, --reload", "Reload pipeline source cache")
        .action(async function ({ template, reload }) {
          await generateAWSCodePipelineConfig(template, reload);
        })
    )
    .description("AWS CodePipeline integration")
    .action(function () {
      this.showHelp();
    })
    .command("docs, man", "Show documentation for a pipeline")
    .arguments("[pipeline:string]")
    .option("--gl, --gitlab", "Show GitLab CI documentation")
    .option("--gh, --github", "Show GitHub Actions documentation")
    .option("--cci, --circleci", "Show CircleCI documentation")
    .option("--ap, --azure", "Show Azure Pipelines documentation")
    .option("--ac, --aws", "Show AWS CodePipeline documentation")
    .action(async function (options, pipeline) {
      await docs(options, pipeline);
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
    .action(async function () {
      await publish();
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
    .parse(Deno.args);
}

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  main();
}
