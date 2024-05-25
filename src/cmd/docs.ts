import { green } from "../../deps.ts";
import { BASE_URL } from "../consts.ts";
import { verifyRequiredDependencies } from "../utils.ts";

async function docs(pipeline = ".") {
  // verify if glow is installed
  await verifyRequiredDependencies(["glow"]);

  if (pipeline === ".") {
    try {
      // verify if .fluentci directory exists
      const fluentciDir = await Deno.stat(".fluentci");
      await Deno.stat(".fluentci/mod.ts");
      if (!fluentciDir.isDirectory) {
        displayErrorMessage();
      }
    } catch (_) {
      displayErrorMessage();
    }

    const command = new Deno.Command("glow", {
      args: [`.fluentci/README.md`, "-p"],
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
  if (!data.github_url && !data.version) {
    console.log(
      `Pipeline template ${green('"')}${green(pipeline)}${green(
        '"'
      )} not found in Fluent CI registry`
    );
    Deno.exit(1);
  }

  const command = new Deno.Command("glow", {
    args: [
      `https://pkg.fluentci.io/${pipeline}@${
        data.version || data.default_branch
      }/README.md`,
      "-p",
    ],
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
