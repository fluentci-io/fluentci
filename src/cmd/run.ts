import { cyan, bold, green, magenta } from "../../deps.ts";
import { BASE_URL, FLUENTCI_API_URL, FLUENTCI_WS_URL } from "../consts.ts";
import { LogEventSchema } from "../types.ts";

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

    if (Deno.env.has("FLUENTCI_TOKEN")) {
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
  if (!data.github_url) {
    console.log(
      `Pipeline template ${green('"')}${green(pipeline)}${green(
        '"'
      )} not found in Fluent CI registry`
    );
    Deno.exit(1);
  }

  let denoModule = [
    `--import-map=https://pkg.fluentci.io/${pipeline}@${data.version}/import_map.json`,
    `https://pkg.fluentci.io/${pipeline}@${data.version}/src/dagger/runner.ts`,
    ...jobs,
    ...Object.keys(options)
      .filter((key) => key !== "reload")
      .map((key) => `--${key}=${options[key]}`),
  ];

  if (options.reload) {
    denoModule = ["-r", ...denoModule];
  }

  if (Deno.env.has("FLUENTCI_TOKEN")) {
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
  const response = await fetch(`${FLUENTCI_API_URL}/connect`, {
    headers: {
      Authorization: `Basic ${btoa(Deno.env.get("FLUENTCI_TOKEN") + ":")}`,
    },
  });
  const { id } = await response.json();
  console.log(`=> Connected to Fluent CI session ${green(id)}`);

  const websocket = new WebSocket(`${FLUENTCI_WS_URL}?id=${id}`);

  const operations: Record<string, number> = {};

  let previousOpId = 0;

  websocket.addEventListener("message", (event) => {
    const log = LogEventSchema.parse(JSON.parse(event.data));

    if (log.payload.internal || log.payload.pipeline === null) {
      return;
    }

    operations[log.payload.op_id] =
      operations[log.payload.op_id] || Object.keys(operations).length + 1;

    if (previousOpId !== operations[log.payload.op_id]) {
      console.log("");
    }

    previousOpId = operations[log.payload.op_id];

    console.log(
      `${magenta(operations[log.payload.op_id] + ":")} > in ${bold(
        purple(
          log.payload.pipeline?.map((x) => x.name).filter((x) => x !== "")[0] ||
            ""
        )
      )}`
    );
    console.log(
      magenta(`${operations[log.payload.op_id]}:`),
      log.payload.op_name,
      // log.payload.op_id,
      log.payload.cached
        ? cyan("CACHED")
        : log.payload.completed
        ? green("DONE")
        : ""
    );
  });

  if (pipeline === ".") {
    const command = new Deno.Command("deno", {
      args: [
        "run",
        "-A",
        "--import-map=.fluentci/import_map.json",
        ".fluentci/src/dagger/runner.ts",
        ...jobs,
      ],
      env: {
        FLUENTCI_SESSION_ID: id,
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    await spawnCommand(command);
    await fetch(`${FLUENTCI_API_URL}/context`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${btoa(Deno.env.get("FLUENTCI_TOKEN") + ":")}`,
        "X-FluentCI-Session-ID": id,
      },
    });
    websocket.close();
    Deno.exit(0);
  }

  const command = new Deno.Command("deno", {
    args: ["run", "-A", ...denoModule!],
    env: {
      FLUENTCI_SESSION_ID: id,
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  await spawnCommand(command);
  await fetch(`${FLUENTCI_API_URL}/context`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${btoa(Deno.env.get("FLUENTCI_TOKEN") + ":")}`,
      "X-FluentCI-Session-ID": id,
    },
  });
  websocket.close();
  Deno.exit(0);
};

function purple(text: string) {
  return `\x1b[95m${text}\x1b[0m`;
}

export default run;
