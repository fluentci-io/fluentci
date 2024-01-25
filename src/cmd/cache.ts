import { green } from "../../deps.ts";
import { BASE_URL } from "../consts.ts";

/**
 * Fetches a pipeline template from https://deno.land/x and caches it using Deno cache command.
 * @param pipeline - The name of the pipeline template to be cached.
 * @returns void
 */
async function cache(pipeline?: string, lockWrite?: boolean) {
  if (lockWrite && !pipeline) {
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
    const command = new Deno.Command("deno", {
      args: ["cache", "--reload", "--lock-write", "deps.ts"],
      stderr: "inherit",
      stdout: "inherit",
      cwd: ".fluentci",
    });

    const child = command.spawn();
    if ((await child.status).code !== 0) {
      Deno.exit(1);
    }
    return;
  }
  const result = await fetch(`${BASE_URL}/pipeline/${pipeline}`);
  const data = await result.json();
  if (!data.github_url && !data.version) {
    console.log(
      `Pipeline template ${green('"')}${green(pipeline!)}${green(
        '"'
      )} not found in Fluent CI registry`
    );
    Deno.exit(1);
  }

  const command = new Deno.Command("deno", {
    args: [
      "cache",
      `--import-map=https://pkg.fluentci.io/${pipeline}@${
        data.version || data.default_branch
      }/import_map.json`,
      `https://pkg.fluentci.io/${pipeline}@${
        data.version || data.default_branch
      }/src/dagger/list_jobs.ts`,
      "--reload",
    ],
    stderr: "inherit",
    stdout: "inherit",
  });

  const child = command.spawn();
  if ((await child.status).code !== 0) {
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

export default cache;
