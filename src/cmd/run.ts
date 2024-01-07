import {
  BlobWriter,
  green,
  load,
  Logger,
  walk,
  ZipWriter,
  dayjs,
  Buffer,
} from "../../deps.ts";
import { BASE_URL, FLUENTCI_WS_URL, RUNNER_URL } from "../consts.ts";
import { getAccessToken, isLogged } from "../utils.ts";

/**
 * Runs a Fluent CI pipeline.
 * @param pipeline - The name of the pipeline to run. If set to ".", the pipeline will be run from the current directory.
 * @param jobs - An array of job names to run.
 * @param options - An object of options.
 * @throws An error if the pipeline fails to run.
 */
async function run(
  pipeline: string,
  jobs: [string, ...Array<string>],
  options: Record<string, string | number | boolean | undefined>
) {
  await load({
    envPath: ".fluentci/.env",
    examplePath: ".fluentci/.env_required",
    export: true,
  });
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

    if (Deno.env.get("FLUENTCI_PROJECT_ID")) {
      await runPipelineRemotely(pipeline, jobs);
      return;
    }

    let command = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        ".fluentci/src/dagger/runner.ts",
        ...jobs,
        ...Object.keys(options)
          .filter((key) => key !== "reload")
          .map((key) => `--${key}=${options[key]}`),
      ],
      stdout: "inherit",
      stderr: "inherit",
    });

    if (
      !Deno.env.has("DAGGER_SESSION_PORT") ||
      !Deno.env.has("DAGGER_SESSION_TOKEN")
    ) {
      command = new Deno.Command("dagger", {
        args: [
          "run",
          "deno",
          "run",
          "-A",
          "--import-map=.fluentci/import_map.json",
          ".fluentci/src/dagger/runner.ts",
          ...jobs,
          ...Object.keys(options)
            .filter((key) => key !== "reload")
            .map((key) => `--${key}=${options[key]}`),
        ],
        stdout: "inherit",
        stderr: "inherit",
      });
    }

    let jobFileExists = false;
    const commands = [];
    for (const job of jobs) {
      try {
        const jobFile = await Deno.stat(`.fluentci/${job}.ts`);
        if (jobFile.isFile) {
          jobFileExists = true;
          commands.push(
            new Deno.Command("dagger", {
              args: [
                "run",
                "deno",
                "run",
                "-A",
                `.fluentci/${job}.ts`,
                ...Object.keys(options)
                  .filter((key) => key !== "reload")
                  .map((key) => `--${key}=${options[key]}`),
              ],
              stdout: "inherit",
              stderr: "inherit",
            })
          );
          break;
        }
      } catch (_) {
        jobFileExists = false;
        break;
      }
      commands.push(
        new Deno.Command("dagger", {
          args: [
            "run",
            "deno",
            "run",
            "-A",
            `.fluentci/${job}.ts`,
            ...Object.keys(options)
              .filter((key) => key !== "reload")
              .map((key) => `--${key}=${options[key]}`)
              .join(" "),
          ],
          stdout: "inherit",
          stderr: "inherit",
        })
      );
    }

    if (jobFileExists) {
      for (const command of commands) {
        await spawnCommand(command);
      }
      return;
    }

    await spawnCommand(command);
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

  let denoModule = [
    `--import-map=https://pkg.fluentci.io/${pipeline}@${
      data.version || data.default_branch
    }/import_map.json`,
    `https://pkg.fluentci.io/${pipeline}@${
      data.version || data.default_branch
    }/src/dagger/runner.ts`,
    ...jobs,
    ...Object.keys(options)
      .filter((key) => key !== "reload")
      .map((key) => `--${key}=${options[key]}`),
  ];

  if (options.reload) {
    denoModule = ["-r", ...denoModule];
  }

  if (Deno.env.get("FLUENTCI_PROJECT_ID")) {
    await runPipelineRemotely(pipeline, jobs, denoModule);
    return;
  }

  let command = new Deno.Command("deno", {
    args: ["run", "-A", ...denoModule],
    stdout: "inherit",
    stderr: "inherit",
  });

  if (
    !Deno.env.has("DAGGER_SESSION_PORT") ||
    !Deno.env.has("DAGGER_SESSION_TOKEN")
  ) {
    command = new Deno.Command("dagger", {
      args: ["run", "deno", "run", "-A", ...denoModule],
      stdout: "inherit",
      stderr: "inherit",
    });
  }

  await spawnCommand(command);
}

const displayErrorMessage = () => {
  console.log(
    `This directory does not contain a FluentCI pipeline. Please run ${green(
      "`fluentci init`"
    )} to initialize a new pipeline.`
  );
  Deno.exit(1);
};

const spawnCommand = async (command: Deno.Command) => {
  const child = command.spawn();
  if ((await child.status).code !== 0) {
    Deno.exit(1);
  }
};

const runPipelineRemotely = async (
  pipeline: string,
  jobs: [string, ...Array<string>],
  denoModule?: string[]
) => {
  if (!(await isLogged())) {
    console.log(
      `You must be logged in to run a pipeline remotely. Run ${green(
        "`fluentci login`"
      )} to log in.`
    );
    Deno.exit(1);
  }

  const logger = new Logger();
  logger.info("🚀 Running pipeline remotely ...");
  const id = Deno.env.get("FLUENTCI_PROJECT_ID");

  const websocket = new WebSocket(`${FLUENTCI_WS_URL}?id=${id}`);

  websocket.addEventListener("message", (event) => {
    console.log(event.data);
  });

  const accessToken = getAccessToken();

  const entries = walk(".", {
    skip: parseIgnoredFiles(),
  });
  const paths = [];

  for await (const entry of entries) {
    paths.push({
      path: entry.path,
      isFile: entry.isFile,
    });
  }

  if (paths.length === 0) {
    console.error("No files found in the current directory");
    Deno.exit(1);
  }

  logger.info("📦 Creating zip file ...");

  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter);

  for await (const { path, isFile } of paths) {
    if (isFile) {
      const file = await Deno.open(path);
      await zipWriter.add(path, file, {
        // this is required to make sure the zip file is deterministic
        // so that the hash of the zip file is always the same
        lastAccessDate: dayjs("2024-01-07T18:30:04.810Z").toDate(),
        lastModDate: dayjs("2024-01-07T18:30:04.810Z").toDate(),
      });
    }
  }

  await zipWriter.close();
  logger.info("🌎 Uploading context ...");

  const blob = await blobWriter.getData();

  const xhr = new XMLHttpRequest();
  xhr.open("POST", RUNNER_URL);
  xhr.setRequestHeader("Content-Type", "application/zip");
  xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

  xhr.onload = function () {
    if (xhr.status != 200) {
      logger.error("❌ Failed to upload context");
      Deno.exit(1);
    } else {
      logger.info("✅ Context uploaded successfully");
      Deno.exit(0);
    }
  };

  xhr.send(blob);
};

const parseIgnoredFiles = () => {
  let ignoredFilesArray: RegExp[] = [];
  try {
    // verify if .fluentciignore exists
    if (Deno.statSync(".fluentciignore").isFile) {
      const ignoredFiles = Deno.readTextFileSync(".fluentciignore");
      ignoredFilesArray = ignoredFilesArray.concat(
        ignoredFiles
          .split("\n")
          .map((file) => new RegExp(file.replace(".", "\\.")))
      );
    }
  } catch (_e) {
    // do nothing
  }

  try {
    const ignoredFiles = Deno.readTextFileSync(".gitignore");
    return ignoredFilesArray.concat(
      ignoredFiles.split("\n").map((file: string) => new RegExp(file))
    );
  } catch (_e) {
    return ignoredFilesArray;
  }
};

function purple(text: string) {
  return `\x1b[95m${text}\x1b[0m`;
}

export default run;
