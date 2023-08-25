import { green } from "https://deno.land/std@0.192.0/fmt/colors.ts";
import { BASE_URL } from "./consts.ts";

/**
 * Fetches a pipeline template from https://deno.land/x and caches it using Deno cache command.
 * @param pipeline - The name of the pipeline template to be cached.
 * @returns void
 */
async function cache(pipeline: string) {
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

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "cache",
      `--import-map=https://deno.land/x/${pipeline}/import_map.json`,
      `https://deno.land/x/${pipeline}/src/dagger/list_jobs.ts`,
    ],
    stderr: "inherit",
    stdout: "inherit",
  });

  const child = command.spawn();
  if ((await child.status).code !== 0) {
    Deno.exit(1);
  }
}

export default cache;
