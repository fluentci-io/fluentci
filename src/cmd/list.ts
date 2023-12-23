import { green } from "../../deps.ts";
import { BASE_URL } from "../consts.ts";

/**
 * Lists the jobs in a Fluent CI pipeline.
 * @param pipeline The name of the pipeline to list jobs for. Defaults to "." (the current directory).
 * @returns void
 */
async function listJobs(pipeline = ".") {
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

    const command = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        ".fluentci/src/dagger/list_jobs.ts",
      ],
    });

    const { stdout, stderr, success } = await command.output();
    if (!success) {
      console.log(new TextDecoder().decode(stderr));
      Deno.exit(1);
    }

    console.log(new TextDecoder().decode(stdout));

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

  const command = new Deno.Command("deno", {
    args: [
      "run",
      "-A",
      `--import-map=https://pkg.fluentci.io/${pipeline}@${
        data.version || data.default_branch
      }/import_map.json`,
      `https://pkg.fluentci.io/${pipeline}@${
        data.version || data.default_branch
      }/src/dagger/list_jobs.ts`,
    ],
  });

  const { stdout, stderr, success } = await command.output();
  if (!success) {
    console.log(new TextDecoder().decode(stderr));
    Deno.exit(1);
  }

  console.log(new TextDecoder().decode(stdout));
}

/**
 * Displays an error message indicating that the directory does not contain a FluentCI pipeline.
 * Exits the process with a non-zero status code.
 */
const displayErrorMessage = () => {
  console.log(
    `This directory does not contain a FluentCI pipeline. Please run ${green(
      "`fluentci init`"
    )} to initialize a new pipeline.`
  );
  Deno.exit(1);
};

export default listJobs;
