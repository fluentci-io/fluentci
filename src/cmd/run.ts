import { BlobWriter, green, load, walk, ZipWriter, dayjs } from "../../deps.ts";
import { BASE_URL, FLUENTCI_WS_URL, RUNNER_URL } from "../consts.ts";
import { getCommitInfos } from "../git.ts";
import { getAccessToken, isLogged, extractVersion } from "../utils.ts";

/**
 * Runs a Fluent CI pipeline.
 * @param pipeline - The name of the pipeline to run. If set to ".", the pipeline will be run from the current directory.
 * @param jobs - An array of job names to run.
 * @param options - An object of options.
 * @throws An error if the pipeline fails to run.
 */
async function run(
  pipeline = ".",
  jobs: [string, ...Array<string>] | string[] = [],
  options: Record<string, string | number | boolean | undefined> = {}
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
      await Deno.stat(".fluentci/mod.ts");
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

  const name = pipeline.split("@")[0];
  let version = extractVersion(pipeline);

  const result = await fetch(`${BASE_URL}/pipeline/${name}`);
  const data = await result.json();

  if (!data.github_url && !data.version) {
    console.log(
      `Pipeline template ${green('"')}${green(name)}${green(
        '"'
      )} not found in Fluent CI registry`
    );
    Deno.exit(1);
  }
  version =
    version === "latest" ? data.version || data.default_branch : version;
  let denoModule = [
    `--import-map=https://pkg.fluentci.io/${name}@${version}/import_map.json`,
    `https://pkg.fluentci.io/${name}@${version}/src/dagger/runner.ts`,
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
  jobs: [string, ...Array<string>] | string[],
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

  console.log("🚀 Running pipeline remotely ...");

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

  console.log("📦 Creating zip file ...");

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

  console.log("🌎 Uploading context ...");

  const query = JSON.stringify({
    pipeline,
    jobs,
    denoModule,
  });

  const blob = await blobWriter.getData();

  const xhr = new XMLHttpRequest();
  xhr.open(
    "POST",
    `${RUNNER_URL}?project_id=${Deno.env.get(
      "FLUENTCI_PROJECT_ID"
    )}&query=${query}`
  );
  xhr.setRequestHeader("Content-Type", "application/zip");
  xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

  xhr.onload = function () {
    if (xhr.status != 200) {
      console.error(
        "❌ Failed to upload context " + xhr.responseText + " " + xhr.status
      );
      Deno.exit(1);
    } else {
      console.log("✅ Context uploaded successfully");
      const { buildId } = JSON.parse(xhr.response);
      saveRepositoryMetadata(buildId);
      const websocket = new WebSocket(
        `${FLUENTCI_WS_URL}?client_id=${buildId}`
      );

      websocket.addEventListener("message", (event) => {
        if (event.data === "fluentci_exit=0") {
          Deno.exit(0);
        }
        if (event.data === "fluentci_exit=1") {
          Deno.exit(1);
        }
        console.log(event.data);
      });
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

const saveRepositoryMetadata = async (id: string) => {
  try {
    const { commit, sha, author, branch } = await getCommitInfos();
    console.log("📝 Saving repository metadata ...");
    const status = await fetch(`${BASE_URL}/build/${id}/metadata`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        commit,
        sha,
        author,
        branch,
      }),
    }).then((res) => res.status);
    if (status !== 200) {
      console.error("❌ Failed to save repository metadata");
      Deno.exit(1);
    }
  } catch (_) {
    // do nothing, not a git repository
  }
};

export default run;
