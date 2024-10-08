import {
  BlobWriter,
  green,
  load,
  walk,
  ZipWriter,
  dayjs,
  toml,
  gql,
  resolve,
} from "../../deps.ts";
import { BASE_URL, FLUENTCI_WS_URL, RUNNER_URL } from "../consts.ts";
import detect, { detectProjectType, dirExists } from "../detect.ts";
import { getCommitInfos } from "../git.ts";
import {
  setupFluentCIengine,
  setupRust,
  fluentciPluginDirExists,
} from "../utils.ts";
import {
  getAccessToken,
  isLogged,
  extractVersion,
  verifyRequiredDependencies,
} from "../utils.ts";
import client from "../client.ts";
import * as projects from "../server/kv/projects.ts";

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
  await verifyRequiredDependencies(
    options.wasm ? ["deno"] : ["deno", "dagger", "docker"]
  );

  await load({
    envPath: ".fluentci/.env",
    examplePath: ".fluentci/.env_required",
    export: true,
  });

  if (options.workDir) {
    if (!(await dirExists(options.workDir as string))) {
      console.error(
        `Directory ${green(options.workDir as string)} does not exist`
      );
      Deno.exit(1);
    }
  }

  if (options.wasm && !options.remoteExec) {
    Deno.env.set("WASM_ENABLED", "1");
    await runWasmPlugin(pipeline, jobs, options.workDir as string);
    Deno.exit(0);
  }

  if (pipeline === ".") {
    if (!Deno.env.has("FLUENTCI_PROJECT_ID")) {
      try {
        // verify if .fluentci directory exists
        const fluentciDir = await Deno.stat(
          `${options.workDir || "."}/.fluentci`
        );
        if (!fluentciDir.isDirectory) {
          displayErrorMessage();
        }
      } catch (_) {
        displayErrorMessage();
      }
      try {
        await Deno.stat(`${options.workDir || "."}/.fluentci/mod.ts`);
      } catch (_) {
        Deno.env.set("WASM_ENABLED", "1");
        await runWasmPlugin(pipeline, jobs, options.workDir as string);
        Deno.exit(0);
      }
    }

    if (Deno.env.get("FLUENTCI_PROJECT_ID")) {
      if (options.remoteExec) {
        try {
          await Deno.stat(`${options.workDir || "."}/.fluentci/mod.ts`);
        } catch (_) {
          await runPipelineRemotely(pipeline, jobs, { ...options, wasm: true });
          return;
        }
        await runPipelineRemotely(pipeline, jobs, options);
        return;
      }
      await detect((options.workDir as string) || ".");

      const query = gql`
        mutation Run($projectId: ID!, $wait: Boolean) {
          runPipeline(projectId: $projectId, wait: $wait) {
            id
          }
        }
      `;
      const project = await projects.byName(
        Deno.env.get("FLUENTCI_PROJECT_ID")!
      );

      if (!project) {
        console.error(
          `Project ${Deno.env.get("FLUENTCI_PROJECT_ID")} not found`
        );
        Deno.exit(1);
      }

      await projects.save({
        ...project,
        path: resolve((options.workDir as string) || "."),
      });

      await projects.deleteAt("empty");

      const ws = new WebSocket("ws://localhost:6076");

      // deno-lint-ignore no-unused-vars
      new Promise((resolve, reject) => {
        try {
          ws.onmessage = (m) => {
            const { channel, data } = JSON.parse(m.data);
            if (channel === "logs") {
              console.log(data.text);
            }
          };
        } catch (e) {
          console.error("Failed to connect to server", e);
        }
      });

      await client.request(query, { projectId: project?.id, wait: true });
      ws.close();

      return;
    }

    try {
      await Deno.stat(`${options.workDir || "."}/.fluentci/mod.ts`);
    } catch (_) {
      Deno.env.set("WASM_ENABLED", "1");
      await runWasmPlugin(pipeline, jobs, options.workDir as string);
      Deno.exit(0);
    }

    let entrypoint = ".fluentci/src/dagger/runner.ts";

    try {
      if (Deno.statSync(".fluentci/src/runner.ts").isFile) {
        entrypoint = ".fluentci/src/runner.ts";
      }
    } catch (_e) {
      // do nothing
    }

    let command = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        entrypoint,
        ...jobs,
        ...Object.keys(options)
          .filter(
            (key) =>
              key !== "reload" &&
              key !== "wasm" &&
              key !== "remoteExec" &&
              key !== "workDir"
          )
          .map((key) => `--${key}=${options[key]}`),
      ],
      stdout: "inherit",
      stderr: "inherit",
      cwd: (options.workDir as string) || ".",
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
          entrypoint,
          ...jobs,
          ...Object.keys(options)
            .filter(
              (key) =>
                key !== "reload" &&
                key !== "wasm" &&
                key !== "remoteExec" &&
                key !== "workDir"
            )
            .map((key) => `--${key}=${options[key]}`),
        ],
        stdout: "inherit",
        stderr: "inherit",
        cwd: (options.workDir as string) || ".",
      });
    }

    let jobFileExists = false;
    const commands = [];
    for (const job of jobs) {
      try {
        const jobFile = await Deno.stat(
          `${(options.workDir as string) || "."}/.fluentci/${job}.ts`
        );
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
                  .filter(
                    (key) =>
                      key !== "reload" &&
                      key !== "wasm" &&
                      key !== "remoteExec" &&
                      key !== "workDir"
                  )
                  .map((key) => `--${key}=${options[key]}`),
              ],
              stdout: "inherit",
              stderr: "inherit",
              cwd: (options.workDir as string) || ".",
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
              .filter(
                (key) =>
                  key !== "reload" &&
                  key !== "wasm" &&
                  key !== "remoteExec" &&
                  key !== "workDir"
              )
              .map((key) => `--${key}=${options[key]}`)
              .join(" "),
          ],
          stdout: "inherit",
          stderr: "inherit",
          cwd: (options.workDir as string) || ".",
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

  let status = await fetch(
    `https://pkg.fluentci.io/${name}@${version}/import_map.json`
  ).then((res) => res.status);
  if (status == 404) {
    if (Deno.env.get("FLUENTCI_PROJECT_ID")) {
      await runPipelineRemotely(pipeline, jobs, { ...options, wasm: true });
      return;
    }
    Deno.env.set("WASM_ENABLED", "1");
    await runWasmPlugin(pipeline, jobs, options.workDir as string);
    Deno.exit(0);
  }

  let entrypoint = `https://pkg.fluentci.io/${name}@${version}/src/dagger/runner.ts`;
  status = await fetch(entrypoint).then((res) => res.status);
  if (status === 404) {
    entrypoint = `https://pkg.fluentci.io/${name}@${version}/src/runner.ts`;
  }

  let denoModule = [
    `--import-map=https://pkg.fluentci.io/${name}@${version}/import_map.json`,
    entrypoint,
    ...jobs,
    ...Object.keys(options)
      .filter((key) => key !== "reload" && key !== "wasm")
      .map((key) => `--${key}=${options[key]}`),
  ];

  if (options.reload) {
    denoModule = ["-r", ...denoModule];
  }

  if (Deno.env.get("FLUENTCI_PROJECT_ID")) {
    await runPipelineRemotely(pipeline, jobs, options, denoModule);
    return;
  }

  let command = new Deno.Command("deno", {
    args: ["run", "-A", ...denoModule],
    stdout: "inherit",
    stderr: "inherit",
    cwd: (options.workDir as string) || ".",
  });

  if (
    !Deno.env.has("DAGGER_SESSION_PORT") ||
    !Deno.env.has("DAGGER_SESSION_TOKEN")
  ) {
    command = new Deno.Command("dagger", {
      args: ["run", "deno", "run", "-A", ...denoModule],
      stdout: "inherit",
      stderr: "inherit",
      cwd: (options.workDir as string) || ".",
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
  options: Record<string, string | number | boolean | undefined> = {},
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

  const projectType = await detectProjectType(
    (options.workDir as string) || "."
  );

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
    wasm: options.wasm,
    denoModule,
    projectType,
    workDir: options.workDir,
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
      const { runId } = JSON.parse(xhr.response);
      saveRepositoryMetadata(runId);
      const websocket = new WebSocket(`${FLUENTCI_WS_URL}?client_id=${runId}`);

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

const parseIgnoredFiles = (): RegExp[] => {
  let ignoredFilesArray: RegExp[] = [];
  try {
    // verify if .fluentciignore exists
    if (Deno.statSync(".fluentciignore").isFile) {
      const ignoredFiles = Deno.readTextFileSync(".fluentciignore");
      ignoredFilesArray = ignoredFilesArray.concat(
        ignoredFiles
          .split("\n")
          .filter((x) => x.trim().length)
          .map((file) => new RegExp(file.replace(".", "\\.")))
      );
    }
  } catch (_e) {
    // do nothing
  }

  try {
    const ignoredFiles = Deno.readTextFileSync(".gitignore");
    return ignoredFilesArray.concat(
      ignoredFiles
        .split("\n")
        .filter((x) => x.trim().length)
        .map((file: string) => new RegExp(file))
    );
  } catch (_e) {
    return ignoredFilesArray;
  }
};

const saveRepositoryMetadata = async (id: string) => {
  try {
    const { commit, sha, author, branch } = await getCommitInfos();
    console.log("📝 Saving repository metadata ...");
    const status = await fetch(`${BASE_URL}/run/${id}/metadata`, {
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

const runWasmPlugin = async (pipeline: string, job: string[], cwd = ".") => {
  if (
    pipeline.endsWith(".wasm") ||
    pipeline.endsWith("?wasm=1") ||
    pipeline.startsWith("azurecr.io/") ||
    pipeline.startsWith("ghcr.io/") ||
    pipeline.startsWith("gcr.io/")
  ) {
    const command = new Deno.Command("bash", {
      args: ["-c", `fluentci-engine call -m ${pipeline} -- ` + job.join(" ")],
      stdout: "inherit",
      stderr: "inherit",
      cwd,
    });
    await spawnCommand(command);
    return;
  }

  const pluginDirExists = await fluentciPluginDirExists(cwd);
  if (!pluginDirExists && pipeline === ".") {
    try {
      await Deno.stat(`${cwd}/.fluentci/Cargo.toml`);
    } catch (_) {
      console.log("This directory does not contain a FluentCI plugin");
      Deno.exit(1);
    }
  }
  await setupRust();
  await setupFluentCIengine();
  if (pipeline == ".") {
    const wasm32 = new Deno.Command("rustup", {
      args: ["target", "add", "wasm32-unknown-unknown"],
      stdout: "inherit",
      stderr: "inherit",
    });
    await spawnCommand(wasm32);

    const build = new Deno.Command("cargo", {
      args: ["build", "--release", "--target", "wasm32-unknown-unknown"],
      stdout: "inherit",
      stderr: "inherit",
      cwd: pluginDirExists ? `${cwd}/.fluentci/plugin` : `${cwd}/.fluentci`,
    });
    await spawnCommand(build);

    const cargoToml = toml.parse(
      Deno.readTextFileSync(
        pluginDirExists
          ? `${cwd}/.fluentci/plugin/Cargo.toml`
          : `${cwd}/.fluentci/Cargo.toml`
      )
      // deno-lint-ignore no-explicit-any
    ) as Record<string, any>;

    const command = new Deno.Command("bash", {
      args: [
        "-c",
        `fluentci-engine call -m ${
          pluginDirExists ? ".fluentci/plugin" : ".fluentci"
        }/target/wasm32-unknown-unknown/release/${cargoToml.package.name.replaceAll(
          "-",
          "_"
        )}.wasm -- ` + job.join(" "),
      ],
      stdout: "inherit",
      stderr: "inherit",
      cwd,
    });
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

  const url = `https://pkg.fluentci.io/${name}@${version}?wasm=1`;

  const command = new Deno.Command("bash", {
    args: ["-c", `fluentci-engine call -m ${url} -- ` + job.join(" ")],
    stdout: "inherit",
    stderr: "inherit",
    cwd,
  });
  await spawnCommand(command);
};

export default run;
