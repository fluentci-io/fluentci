import { green } from "../../deps.ts";
import { BASE_URL } from "../consts.ts";

/**
 * Generates AWS CodePipeline file based on a pipeline template.
 * @param pipeline - The name of the pipeline template to use. If not provided, it will use the pipeline template specified in the `.fluentci` directory.
 * @param reload - Whether to reload the pipeline template from the registry or use the cached version.
 * @returns void
 */
async function generateAWSCodePipelineConfig(
  pipeline?: string,
  reload = false
) {
  if (!pipeline) {
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
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        ".fluentci/src/aws/init.ts",
      ],
    });

    const { stdout, stderr, success } = await command.output();
    if (!success) {
      console.log(new TextDecoder().decode(stdout));
      console.log(new TextDecoder().decode(stderr));
      Deno.exit(1);
    }

    console.log(`${green("`buildspec.yml`")} generated successfully ✅`);

    return;
  }

  if (!pipeline.endsWith("_pipeline")) {
    const result = await fetch(`${BASE_URL}/pipeline/${pipeline}`);
    const data = await result.json();
    if (!data.name) {
      pipeline = pipeline + "_pipeline";
    }
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

  let denoModule = [
    `--import-map=https://pkg.fluentci.io/${pipeline}@${
      data.version || data.default_branch
    }/import_map.json`,
    `https://pkg.fluentci.io/${pipeline}@${
      data.version || data.default_branch
    }/src/aws/init.ts`,
  ];

  if (reload) {
    denoModule = ["-r", ...denoModule];
  }

  const command = new Deno.Command("deno", {
    args: ["run", "-A", ...denoModule],
  });

  const { stdout, stderr, success } = await command.output();
  if (!success) {
    console.log(new TextDecoder().decode(stdout));
    console.log(new TextDecoder().decode(stderr));
    Deno.exit(1);
  }

  console.log(`${green("`buildspec.yml`")} generated successfully ✅`);
}

const displayErrorMessage = () => {
  console.log(
    `This directory does not contain a FluentCI pipeline. Please run ${green(
      "`fluentci init`"
    )} to initialize a new pipeline.`
  );
  Deno.exit(1);
};

export default generateAWSCodePipelineConfig;
