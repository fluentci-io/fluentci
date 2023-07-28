import { green } from "https://deno.land/std@0.192.0/fmt/colors.ts";

async function run(pipeline: string) {
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
        `--import-map=.fluentci/import_map.json`,
        `.fluentci/src/dagger/runner.ts`,
      ],
    });

    await command.output();
    return;
  }

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      `--import-map=https://deno.land/x/${pipeline}/import_map.json`,
      `https://deno.land/x/${pipeline}/src/dagger/runner.ts`,
    ],
  });

  await command.output();
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
