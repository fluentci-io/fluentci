import {
  SpinnerTypes,
  TerminalSpinner,
  Metadata,
  magenta,
  introspect,
  green,
  cyan,
  bold,
  yellow,
} from "../../deps.ts";
import { BASE_URL } from "../consts.ts";
import { extractVersion, fluentciDirExists } from "../utils.ts";

async function repl({ debug }: { debug?: boolean }, pipelines: string[]) {
  const terminalSpinner = new TerminalSpinner({
    text: `Loading functions ...`,
    spinner: SpinnerTypes.dots,
  });
  terminalSpinner.start();

  const isFluentciProject = await fluentciDirExists();
  const parsedPipelines = await parsePipelines(pipelines);
  const args = [];

  if (isFluentciProject) {
    const metadata = introspect("./.fluentci/mod.ts");
    const functions = metadata.map((fn) => fn.functionName).join(", ");
    args.push(`--eval=
    import {${functions}} from "./.fluentci/mod.ts";
      function help() {
        ${(await descriptions(metadata, parsedPipelines))
          .map(
            (x) =>
              `console.log("${x.job ? yellow(x.name) : cyan(x.name)} ${
                x.description
              }")`
          )
          .join(";\n")}
      }
    `);
  } else {
    args.push(`--eval=
      function help() {
        ${(await descriptions([], parsedPipelines))
          .map(
            (x) =>
              `console.log("${x.job ? yellow(x.name) : cyan(x.name)} ${
                x.description
              }")`
          )
          .join(";\n")}
      }
    `);
  }

  for (const { name, version } of parsedPipelines) {
    if (args.length > 0) {
      args[0] = `${args[0]};import * as ${name.replaceAll(
        "_pipeline",
        ""
      )} from "https://pkg.fluentci.io/${name}@${version}/mod.ts"`;
    } else {
      args.push(
        `--eval=import * as ${name.replaceAll(
          "_pipeline",
          ""
        )} from "https://pkg.fluentci.io/${name}@${version}/mod.ts"`
      );
    }
  }

  terminalSpinner.succeed("Functions loaded!");

  const port = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
  const dagger = await startDagger(port, debug);
  const command = new Deno.Command("deno", {
    args: [
      "repl",
      "-A",
      "--eval-file=https://cdn.jsdelivr.net/gh/fluentci-io/fluentci@0c8a9aa/src/prelude.ts",
      ...args,
    ],
    env: {
      DAGGER_SESSION_TOKEN: "repl",
      DAGGER_SESSION_PORT: port.toString(),
    },
    stdout: "inherit",
    stdin: "inherit",
    stderr: "inherit",
  });

  console.log(`
  .
      ______              __  _________
     / __/ /_ _____ ___  / /_/ ___/  _/
    / _// / // / -_) _ \\/ __/ /___/ /  
   /_/ /_/\\_,_/\\__/_//_/\\__/\\___/___/
   
  https://fluentci.io       
 
Welcome to the ${magenta("FluentCI REPL!")}
You can call any ${green("FluentCI Pipeline function")} or any ${green(
    "fluentci command"
  )} (as a function) here.

Enter ${green("help()")} to see a list of available functions.

${bold("Examples:")}
  await docs();
  await run();
  await ls();
  await client.container().from('alpine').withExec(['echo', 'hello']).stdout();
`);

  const process = command.spawn();
  await process.status;

  if (dagger) {
    dagger.kill();
  }

  Deno.exit(0);
}

async function startDagger(port: number, debug?: boolean) {
  let ready = false;
  const terminalSpinner = new TerminalSpinner({
    text: `Starting Dagger API ...`,
    spinner: SpinnerTypes.dots,
  });
  terminalSpinner.start();

  const command = new Deno.Command("dagger", {
    args: ["listen", "--listen", `127.0.0.1:${port}`],
    env: {
      DAGGER_SESSION_TOKEN: "repl",
    },
    stdout: "piped",
    stderr: "piped",
  });

  const writable = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      if (debug || ready) {
        console.log(text);
      }
    },
  });

  const process = command.spawn();
  process.stderr?.pipeTo(writable).catch((err) => {
    console.error(err);
    Deno.exit(1);
  });
  while (true) {
    try {
      // sleep for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const conn = await Deno.connect({ port });
      conn.close();
      break;
    } catch (_) {
      // do nothing
    }
  }
  terminalSpinner.succeed("Dagger API started!");
  ready = true;
  return process;
}

async function descriptions(
  metadata: Metadata[],
  parsedPipelines: { name: string; version: string }[]
) {
  const descriptions: { name: string; description: string; job?: boolean }[] = [
    {
      name: "client",
      description: `a default ${bold(
        "Dagger Client"
      )} for interacting with Dagger`,
      job: true,
    },
    {
      name: "ls",
      description:
        "list all available functions in the current pipeline or a specific pipeline",
    },
    {
      name: "docs",
      description:
        "open documentation for the current pipeline or a specific pipeline from the package registry",
    },
    {
      name: "run",
      description:
        "run the current pipeline or a specific pipeline from the package registry",
    },
    {
      name: "upgrade",
      description: "upgrade FluentCI CLI to the latest version",
    },
    {
      name: "init",
      description: "initialize a new pipeline",
    },
    {
      name: "search",
      description: "search for reusable pipelines",
    },
    {
      name: "cache",
      description: "cache remote dependencies of a pipeline",
    },
    {
      name: "doctor",
      description: "diagnose and fix common FluentCI issues",
    },
    {
      name: "whoami",
      description: "display the currently logged in user",
    },
  ];
  for (const fn of metadata) {
    descriptions.push({
      name: fn.functionName,
      description: fn.doc || "",
      job: true,
    });
  }
  for (const { name, version } of parsedPipelines) {
    const x = await import(`https://pkg.fluentci.io/${name}@${version}/mod.ts`);
    const { jobDescriptions } = x;
    for (const job of Object.keys(jobDescriptions)) {
      descriptions.push({
        name: `${name.replaceAll("_pipeline", "")}.${job}`,
        description: jobDescriptions[job] || "",
        job: true,
      });
    }
  }
  return descriptions.sort((a, b) => a.name.localeCompare(b.name));
}

async function parsePipelines(pipelines: string[]) {
  const results = [];
  for (const pipeline of pipelines) {
    const name = pipeline.split("@")[0];
    let version = extractVersion(pipeline);

    const result = await fetch(`${BASE_URL}/pipeline/${name}`);
    const data = await result.json();

    if (!data.github_url && !data.version) {
      console.log(
        `Pipeline template ${green('"')}${green(name)}${green(
          '"'
        )} not found in Fluent CI registry`
      );
      Deno.exit(1);
    }
    version =
      version === "latest" ? data.version || data.default_branch : version;
    results.push({
      name,
      version,
    });
  }

  return results;
}

export default repl;
