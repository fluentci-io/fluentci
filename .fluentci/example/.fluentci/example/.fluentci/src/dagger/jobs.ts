import Client from "../../deps.ts";
import { withDevbox, connect } from "../../deps.ts";
import { existsSync } from "node:fs";

export enum Job {
  fmt = "fmt",
  lint = "lint",
  test = "test",
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
        .withExec(["apk", "add", "bash", "curl"])
        .withMountedCache("/nix", client.cacheVolume("nix"))
        .withMountedCache("/etc/nix", client.cacheVolume("nix-etc"))
    );
  }
  return client.pipeline(pipeline).container().from("denoland/deno:alpine");
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
  });
  return result;
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
  });

  return result;
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
  });
  return result;
};

export const deploy = async (src = ".") => {
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
    const project = Deno.env.get("DENO_PROJECT");
    const noStatic = Deno.env.get("NO_STATIC");
    const excludeOpt = Deno.env.get("EXCLUDE");

    let command = ["deployctl", "deploy"];

    if (noStatic) {
      command = command.concat(["--no-static"]);
    }

    if (excludeOpt) {
      command = command.concat([`--exclude=${excludeOpt}`]);
    }

    if (!Deno.env.get("DENO_DEPLOY_TOKEN")) {
      throw new Error("DENO_DEPLOY_TOKEN environment variable is not set");
    }

    if (!project) {
      throw new Error("DENO_PROJECT environment variable is not set");
    }

    const script = Deno.env.get("DENO_MAIN_SCRIPT") || "main.tsx";
    command = command.concat([`--project=${project}`, script]);

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
      .withEnvVariable("DENO_DEPLOY_TOKEN", Deno.env.get("DENO_DEPLOY_TOKEN")!)
      .withEnvVariable(
        "DENO_MAIN_SCRIPT",
        Deno.env.get("DENO_MAIN_SCRIPT") || "main.tsx"
      )
      .withExec(installDeployCtl)
      .withExec(command);

    result = await ctr.stdout();
  });

  return result;
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
  [Job.deploy]: deploy,
};

export const jobDescriptions: Record<Job, string> = {
  [Job.fmt]: "Format your code",
  [Job.lint]: "Lint your code",
  [Job.test]: "Run your tests",
  [Job.deploy]: "Deploy your code to Deno Deploy",
};
