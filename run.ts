import { green } from "https://deno.land/std@0.192.0/fmt/colors.ts";
import { BASE_URL } from "./consts.ts";

/**
 * Runs a Fluent CI pipeline.
 * @param pipeline - The name of the pipeline to run. If set to ".", the pipeline will be run from the current directory.
 * @param jobs - An array of job names to run.
 * @param reload - Whether to reload the pipeline before running it.
 * @throws An error if the pipeline fails to run.
 */
async function run(
  pipeline: string,
  jobs: [string, ...Array<string>],
  reload = false
) {
  if (pipeline === ".") {
    try {
      // verify if .fluentci directory exists
      const fluentciDir = await Deno.stat(".fluentci");
      if (!fluentciDir.isDirectory) {
        displayErrorMessage();
      }
    } catch (_) {
      displayErrorMessage();
    }

    let command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        ".fluentci/src/dagger/runner.ts",
        ...jobs,
      ],
      stdout: "piped",
    });

    if (
      !Deno.env.has("DAGGER_SESSION_PORT") ||
      !Deno.env.has("DAGGER_SESSION_TOKEN")
    ) {
      command = new Deno.Command("dagger", {
        args: [
          "run",
          "--progress",
          "plain",
          "deno",
          "run",
          "-A",
          "--import-map=.fluentci/import_map.json",
          ".fluentci/src/dagger/runner.ts",
          ...jobs,
        ],
        stdout: "piped",
      });
    }

    await pipeToStdout(command);
    return;
  }

  const result = await fetch(`${BASE_URL}/pipeline/${pipeline}`);
  const data = await result.json();
  if (!data.github_url) {
    console.log(
      `Pipeline template ${green('"')}${green(pipeline)}${green(
        '"'
      )} not found in Fluent CI registry`
    );
    Deno.exit(1);
  }

  let denoModule = [
    `--import-map=https://deno.land/x/${pipeline}/import_map.json`,
    `https://deno.land/x/${pipeline}/src/dagger/runner.ts`,
    ...jobs,
  ];

  if (reload) {
    denoModule = ["-r", ...denoModule];
  }

  let command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", ...denoModule],
    stdout: "piped",
  });

  if (
    !Deno.env.has("DAGGER_SESSION_PORT") ||
    !Deno.env.has("DAGGER_SESSION_TOKEN")
  ) {
    command = new Deno.Command("dagger", {
      args: ["run", "--progress", "plain", "deno", "run", "-A", ...denoModule],
      stdout: "piped",
    });
  }

  await pipeToStdout(command);
}

const displayErrorMessage = () => {
  console.log(
    `This directory does not contain a FluentCI pipeline. Please run ${green(
      "`fluentci init`"
    )} to initialize a new pipeline.`
  );
  Deno.exit(1);
};

const pipeToStdout = async (command: Deno.Command) => {
  const child = command.spawn();
  await child.stdout.pipeTo(Deno.stdout.writable, { preventCancel: true });
  if ((await child.status).code !== 0) {
    await child.stderr.pipeTo(Deno.stderr.writable, { preventCancel: true });
    Deno.exit(1);
  }
};

export default run;
