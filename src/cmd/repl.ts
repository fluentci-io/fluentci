import {
  SpinnerTypes,
  TerminalSpinner,
  magenta,
  introspect,
  green,
} from "../../deps.ts";
import { BASE_URL } from "../consts.ts";
import { extractVersion, fluentciDirExists } from "../utils.ts";

async function repl(
  { quiet, debug }: { quiet?: boolean; debug?: boolean },
  pipelines: string[]
) {
  const isFluentciProject = await fluentciDirExists();
  const args = [];
  if (isFluentciProject) {
    const metadata = introspect("./.fluentci/mod.ts");
    const functions = metadata.map((fn) => fn.functionName).join(", ");
    args.push(`--eval=import {${functions}} from "./.fluentci/mod.ts"`);
  }

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

  let command = new Deno.Command("dagger", {
    args: [
      "--progress",
      "plain",
      "run",
      "deno",
      "repl",
      "-A",
      "--eval-file=https://cdn.jsdelivr.net/gh/fluentci-io/fluentci@7672799/src/prelude.ts",
      ...args,
    ],
    stdout: "inherit",
    stdin: "inherit",
    stderr: "inherit",
  });
  let dagger: Deno.ChildProcess | undefined;

  if (quiet) {
    dagger = await startDagger(debug);
    command = new Deno.Command("deno", {
      args: [
        "repl",
        "-A",
        "--eval-file=https://cdn.jsdelivr.net/gh/fluentci-io/fluentci@7672799/src/prelude.ts",
        ...args,
      ],
      env: {
        DAGGER_SESSION_TOKEN: "repl",
        DAGGER_SESSION_PORT: "8080",
      },
      stdout: "inherit",
      stdin: "inherit",
      stderr: "inherit",
    });
  }

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
  )} (as a function) here.`);

  const process = command.spawn();
  await process.status;

  if (dagger) {
    dagger.kill();
  }

  Deno.exit(0);
}

async function startDagger(debug?: boolean) {
  let ready = false;
  const terminalSpinner = new TerminalSpinner({
    text: `Starting Dagger API ...`,
    spinner: SpinnerTypes.dots,
  });
  terminalSpinner.start();

  const command = new Deno.Command("dagger", {
    args: ["listen"],
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
      const conn = await Deno.connect({ port: 8080 });
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

export default repl;
