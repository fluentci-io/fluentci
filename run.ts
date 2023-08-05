import { green } from "https://deno.land/std@0.192.0/fmt/colors.ts";
import { BASE_URL } from "./consts.ts";

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

    const command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        ".fluentci/src/dagger/runner.ts",
        ...jobs,
      ],
    });

    const { stderr, success } = await command.output();
    if (!success) {
      console.log(new TextDecoder().decode(stderr));
      Deno.exit(1);
    }
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

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", ...denoModule],
  });

  const { stderr, success } = await command.output();
  if (!success) {
    console.log(new TextDecoder().decode(stderr));
    Deno.exit(1);
  }
}

const displayErrorMessage = () => {
  console.log(
    `This directory does not contain a FluentCI pipeline. Please run ${green(
      "`fluentci init`"
    )} to initialize a new pipeline.`
  );
  Deno.exit(1);
};

export default run;
