import { green } from "https://deno.land/std@0.192.0/fmt/colors.ts";
import { BASE_URL } from "./consts.ts";

async function docs(pipeline: string) {
  // verify if glow is installed

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

    const command = new Deno.Command("glow", {
      args: [".fluentci/README.md"],
      stdout: "inherit",
      stderr: "inherit",
    });

    const { status } = await command.spawn();

    if ((await status).code !== 0) {
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

  const command = new Deno.Command("glow", {
    args: [`https://deno.land/x/${pipeline}/README.md`],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { status } = await command.spawn();
  if ((await status).code !== 0) {
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

export default docs;
