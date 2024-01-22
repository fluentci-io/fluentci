import Client, { Directory, Secret, File } from "../../deps.ts";
import { connect } from "../../sdk/connect.ts";
import { existsSync } from "node:fs";
import { getDirectory, getDenoDeployToken } from "./lib.ts";

export enum Job {
  fmt = "fmt",
  lint = "lint",
  test = "test",
  compile = "compile",
  deploy = "deploy",
}

export const exclude = [".git", ".devbox", ".fluentci"];

const baseCtr = (client: Client, pipeline: string) => {
  return client
    .pipeline(pipeline)
    .container()
    .from("denoland/deno:alpine")
    .withExec(["apk", "update"])
    .withExec(["apk", "add", "perl-utils"]);
};

/**
 * @function
 * @description Lint your code
 * @param {string | Directory} src
 * @returns {string}
 */
export async function lint(
  src: string | Directory | undefined = "."
): Promise<Directory | string> {
  let id = "";
  await connect(async (client) => {
    const context = getDirectory(client, src);
    let command = ["deno", "lint"];

    if (existsSync("devbox.json")) {
      command = ["sh", "-c", `devbox run -- ${command.join(" ")}`];
    }

    const ctr = baseCtr(client, Job.lint)
      .withDirectory("/app", context, {
        exclude,
      })
      .withWorkdir("/app")
      .withExec(command);

    const result = await ctr.stdout();
    console.log(result);

    id = await ctr.directory("/app").id();
  });
  return id;
}

/**
 * @function
 * @description Format your code
 * @param {string | Directory} src
 * @returns {string}
 */
export async function fmt(
  src: string | Directory | undefined = "."
): Promise<Directory | string> {
  let id = "";
  await connect(async (client) => {
    const context = getDirectory(client, src);
    let command = ["deno", "fmt"];

    if (existsSync("devbox.json")) {
      command = ["sh", "-c", `devbox run -- ${command.join(" ")}`];
    }

    const ctr = baseCtr(client, Job.fmt)
      .withDirectory("/app", context, {
        exclude,
      })
      .withWorkdir("/app")
      .withExec(command);

    const result = await ctr.stdout();
    console.log(result);
    id = await ctr.directory("/app").id();
  });

  return id;
}

/**
 * @function
 * @description Run your tests
 * @param {string | Directory} src
 * @param {string[]} ignore
 * @returns {string}
 */
export async function test(
  src: string | Directory | undefined = ".",
  ignore: string[] = []
): Promise<File | string> {
  let id = "";
  await connect(async (client) => {
    const context = getDirectory(client, src);
    let command = ["deno", "test", "-A", "--coverage=coverage", "--lock-write"];

    if (ignore.length > 0) {
      command = command.concat([`--ignore=${ignore.join(",")}`]);
    }

    if (existsSync("devbox.json")) {
      command = ["sh", "-c", `devbox run -- ${command.join(" ")}`];
    }

    const ctr = baseCtr(client, Job.test)
      .from("denoland/deno:alpine")
      .withDirectory("/app", context, {
        exclude,
      })
      .withWorkdir("/app")
      .withMountedCache("/deno-dir", client.cacheVolume("deno-cache"))
      .withExec(command)
      .withExec([
        "sh",
        "-c",
        "deno coverage ./coverage --lcov > coverage.lcov",
      ]);

    const cov = await ctr.file("/app/coverage.lcov");
    cov.export("./coverage.lcov");
    id = await cov.id();

    const result = await ctr.stdout();
    console.log(result);
  });
  return id;
}

/**
 * @function
 * @description Compile your code
 * @param {string | Directory} src
 * @param {string} file
 * @param {string} output
 * @param {string} target
 * @returns {string}
 */
export async function compile(
  src: string | Directory | undefined = ".",
  file = "main.ts",
  output = "main",
  target = "x86_64-unknown-linux-gnu"
): Promise<File | string> {
  let id = "";
  await connect(async (client) => {
    const context = getDirectory(client, src);
    let command = [
      "deno",
      "compile",
      "-A",
      "--output",
      output,
      "--target",
      Deno.env.get("TARGET") || target,
      file,
    ];

    if (existsSync("devbox.json")) {
      command = ["sh", "-c", `devbox run -- ${command.join(" ")}`];
    }

    const ctr = baseCtr(client, Job.fmt)
      .withMountedCache("/assets", client.cacheVolume("gh-release-assets"))
      .withDirectory("/app", context, {
        exclude,
      })
      .withWorkdir("/app")
      .withExec(command)
      .withExec(["ls", "-ltr", "."])
      .withExec([
        "tar",
        "czvf",
        `/assets/${output}_${Deno.env.get("TAG") || ""}_${
          Deno.env.get("TARGET") || target
        }.tar.gz`,
        output,
      ])
      .withExec([
        "sh",
        "-c",
        `shasum -a 256 /assets/${output}_${Deno.env.get("TAG") || ""}_${
          Deno.env.get("TARGET") || target
        }.tar.gz > /assets/${output}_${
          Deno.env.get("TAG") || ""
        }_${Deno.env.get("TARGET" || target)}.tar.gz.sha256`,
      ]);

    const exe = await ctr.file(`/app/${output}`);
    exe.export(`./${output}`);

    await ctr.stdout();
    id = await exe.id();
  });

  return id;
}

/**
 * @function
 * @description Deploy your code to Deno Deploy
 * @param {string | Directory} src
 * @param {string | Secret} token
 * @param {string} project
 * @param {string} main
 * @param {boolean} noStatic
 * @param {string} excludeOpt
 * @returns {string}
 */
export async function deploy(
  src: string | Directory | undefined = ".",
  token?: string | Secret,
  project?: string,
  main?: string,
  noStatic?: boolean,
  excludeOpt?: string
): Promise<string> {
  let result = "";
  await connect(async (client) => {
    const context = getDirectory(client, src);
    let installDeployCtl = [
      "deno",
      "install",
      "--allow-all",
      "--no-check",
      "-r",
      "-f",
      "https://deno.land/x/deploy/deployctl.ts",
    ];

    let command = ["deployctl", "deploy"];

    if (Deno.env.get("NO_STATIC") || noStatic) {
      command = command.concat(["--no-static"]);
    }

    if (Deno.env.get("EXCLUDE") || excludeOpt) {
      command = command.concat([
        `--exclude=${Deno.env.get("EXCLUDE") || excludeOpt}`,
      ]);
    }

    const secret = getDenoDeployToken(client, token);

    if (!secret) {
      console.error("DENO_DEPLOY_TOKEN environment variable is not set");
      Deno.exit(1);
    }

    if (!project) {
      throw new Error("DENO_PROJECT environment variable is not set");
    }

    const script = Deno.env.get("DENO_MAIN_SCRIPT") || "main.tsx";
    command = command.concat([
      `--project=${Deno.env.get("DENO_PROJECT") || project}`,
      script,
    ]);

    if (existsSync("devbox.json")) {
      command = ["sh", "-c", `devbox run -- ${command.join(" ")}`];
      installDeployCtl = [
        "sh",
        "-c",
        `devbox run -- ${installDeployCtl.join(" ")}`,
      ];
    }

    const ctr = baseCtr(client, Job.deploy)
      .from("denoland/deno:alpine")
      .withDirectory("/app", context, {
        exclude,
      })
      .withWorkdir("/app")
      .withEnvVariable("PATH", "/root/.deno/bin:$PATH", { expand: true })
      .withSecretVariable("DENO_DEPLOY_TOKEN", secret)
      .withEnvVariable(
        "DENO_MAIN_SCRIPT",
        Deno.env.get("DENO_MAIN_SCRIPT") || main || "main.tsx"
      )
      .withExec(installDeployCtl)
      .withExec(command);

    result = await ctr.stdout();
    console.log(result);
  });

  return "Done";
}

export type JobExec =
  | ((src: string | Directory | undefined) => Promise<Directory | string>)
  | ((
      src: string | Directory | undefined,
      ignore?: string[]
    ) => Promise<File | string>)
  | ((
      src: string | Directory | undefined,
      file?: string,
      output?: string,
      target?: string
    ) => Promise<File | string>);

export const runnableJobs: Record<Job, JobExec> = {
  [Job.fmt]: fmt,
  [Job.lint]: lint,
  [Job.test]: test,
  [Job.compile]: compile,
  [Job.deploy]: deploy,
};

export const jobDescriptions: Record<Job, string> = {
  [Job.fmt]: "Format your code",
  [Job.lint]: "Lint your code",
  [Job.test]: "Run your tests",
  [Job.compile]: "Compile your code",
  [Job.deploy]: "Deploy your code to Deno Deploy",
};
