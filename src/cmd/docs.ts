import { green } from "../../deps.ts";
import { BASE_URL } from "../consts.ts";

async function docs(
  options: {
    gl?: unknown;
    gh?: unknown;
    cci?: unknown;
    ap?: unknown;
    ac?: unknown;
  },
  pipeline = "."
) {
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
      args: [`.fluentci/${buildREADMEPath(options)}`, "-p"],
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
      }/${buildREADMEPath(options)}`,
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

const buildREADMEPath = (options: {
  gl?: unknown;
  gh?: unknown;
  cci?: unknown;
  ap?: unknown;
  ac?: unknown;
}) => {
  if (options.gl) {
    return "src/gitlab/README.md";
  }

  if (options.gh) {
    return "src/github/README.md";
  }

  if (options.cci) {
    return "src/circleci/README.md";
  }

  if (options.ap) {
    return "src/azure/README.md";
  }

  if (options.ac) {
    return "src/aws/README.md";
  }

  return "README.md";
};

export default docs;
