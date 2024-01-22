import Client from "../../deps.ts";
import { withDevbox, connect } from "../../deps.ts";
import { existsSync } from "node:fs";

export enum Job {
  fmt = "fmt",
  lint = "lint",
  test = "test",
  compile = "compile",
  deploy = "deploy",
}

export const exclude = [".git", ".devbox", ".fluentci"];

const baseCtr = (client: Client, pipeline: string) => {
  if (existsSync("devbox.json")) {
    return withDevbox(
      client
        .pipeline(pipeline)
        .container()
        .from("alpine:latest")
        .withExec(["apk", "update"])
        .withExec(["apk", "add", "bash", "curl", "perl-utils"])
        .withMountedCache("/nix", client.cacheVolume("nix"))
        .withMountedCache("/etc/nix", client.cacheVolume("nix-etc"))
    );
  }
  return client
    .pipeline(pipeline)
    .container()
    .from("denoland/deno:alpine")
    .withExec(["apk", "update"])
    .withExec(["apk", "add", "perl-utils"]);
};

export const lint = async (src = ".") => {
  let result = "";
  await connect(async (client) => {
    const context = client.host().directory(src);
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

    result = await ctr.stdout();
    console.log(result);
  });
  return "Done";
};

export const fmt = async (src = ".") => {
  let result = "";
  await connect(async (client) => {
    const context = client.host().directory(src);
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

    result = await ctr.stdout();
    console.log(result);
  });

  return "Done";
};

export const test = async (
  src = ".",
  options: { ignore: string[] } = { ignore: [] }
) => {
  let result = "";
  await connect(async (client) => {
    const context = client.host().directory(src);
    let command = ["deno", "test", "-A", "--coverage=coverage", "--lock-write"];

    if (options.ignore.length > 0) {
      command = command.concat([`--ignore=${options.ignore.join(",")}`]);
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

    await ctr.file("/app/coverage.lcov").export("./coverage.lcov");

    result = await ctr.stdout();
    console.log(result);
  });
  return "Done";
};

export const compile = async (
  src = ".",
  file = "main.ts",
  output = "main",
  target = "x86_64-unknown-linux-gnu"
) => {
  await connect(async (client) => {
    const context = client.host().directory(src);
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

    await ctr.file(`/app/${output}`).export(`./${output}`);

    await ctr.stdout();
  });

  return "Done";
};

export const deploy = async (
  src = ".",
  token?: string,
  project?: string,
  main?: string,
  noStatic?: boolean,
  excludeOpt?: string
) => {
  let result = "";
  await connect(async (client) => {
    const context = client.host().directory(src);
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

    if (!Deno.env.get("DENO_DEPLOY_TOKEN") && !token) {
      throw new Error("DENO_DEPLOY_TOKEN environment variable is not set");
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
      .withEnvVariable(
        "DENO_DEPLOY_TOKEN",
        Deno.env.get("DENO_DEPLOY_TOKEN") || token!
      )
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
};

export type JobExec = (src?: string) =>
  | Promise<string>
  | ((
      client: Client,
      src?: string,
      options?: {
        ignore: string[];
      }
    ) => Promise<string>);

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
