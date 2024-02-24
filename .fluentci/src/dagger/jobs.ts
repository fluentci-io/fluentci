import Client, { Directory, Secret, File } from "../../deps.ts";
import { connect } from "../../sdk/connect.ts";
import { existsSync } from "node:fs";
import { getDirectory, getDenoDeployToken, getGithubToken } from "./lib.ts";

export enum Job {
  fmt = "fmt",
  lint = "lint",
  test = "test",
  compile = "compile",
  deploy = "deploy",
  publish = "publish",
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
    const context = await getDirectory(client, src);
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
    const context = await getDirectory(client, src);
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
    const context = await getDirectory(client, src);
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
  _output = "main",
  target = "x86_64-unknown-linux-gnu"
): Promise<File | string> {
  let id = "";
  await connect(async (client) => {
    const context = await getDirectory(client, src);
    let command = [
      "deno",
      "compile",
      "-A",
      "--output",
      "fluentci",
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
        `/assets/fluentci_${Deno.env.get("TAG") || ""}_${
          Deno.env.get("TARGET") || target
        }.tar.gz`,
        "fluentci",
      ])
      .withExec([
        "sh",
        "-c",
        `shasum -a 256 /assets/fluentci_${Deno.env.get("TAG") || ""}_${
          Deno.env.get("TARGET") || target
        }.tar.gz > /assets/fluentci_${Deno.env.get("TAG") || ""}_${
          Deno.env.get("TARGET") || target
        }.tar.gz.sha256`,
      ])
      .withExec(["sh", "-c", "cp /assets/* /app"]);

    const sha256 = await ctr.file(
      `/app/fluentci_${Deno.env.get("TAG") || ""}_${
        Deno.env.get("TARGET") || target
      }.tar.gz.sha256`
    );
    const tar = await ctr.file(
      `/app/fluentci_${Deno.env.get("TAG") || ""}_${
        Deno.env.get("TARGET") || target
      }.tar.gz`
    );
    tar.export(
      `./fluentci_${Deno.env.get("TAG") || ""}_${
        Deno.env.get("TARGET") || target
      }.tar.gz`
    );
    sha256.export(
      `./fluentci_${Deno.env.get("TAG") || ""}_${
        Deno.env.get("TARGET") || target
      }.tar.gz.sha256`
    );

    await ctr.stdout();
    id = await tar.id();
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
    const context = await getDirectory(client, src);
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

/**
 * @function
 * @description Publish a flake to flakestry.dev
 * @param {string | Directory} src
 * @returns {string}
 */
export async function publish(
  src: string | Directory,
  version: string,
  ref: string,
  ghToken: Secret | string,
  actionsIdTokenRequestToken: string,
  actionsIdTokenRequestUrl: string,
  url = "https://flakestry.dev",
  ignoreConflicts = false
): Promise<string> {
  let output = "";
  await connect(async (client: Client) => {
    const context = await getDirectory(client, src);
    const ctr = client
      .pipeline(Job.publish)
      .container()
      .from("ubuntu:latest")
      .withExec(["apt-get", "update"])
      .withExec(["apt-get", "install", "-y", "curl", "jq", "git"])
      .withExec([
        "sh",
        "-c",
        `curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install linux \
          --extra-conf "sandbox = false" \
          --init none \
          --no-confirm
        `,
      ])
      .withExec([
        "sed",
        "-i",
        "s/auto-allocate-uids = true/auto-allocate-uids = false/g",
        "/etc/nix/nix.conf",
      ])
      .withEnvVariable("PATH", "${PATH}:/nix/var/nix/profiles/default/bin", {
        expand: true,
      })
      .withDirectory("/app", context)
      .withWorkdir("/app")
      .withExec([
        "bash",
        "-c",
        `\
        echo null > metadata.err
        echo null > metadata.json
        echo null > outputs.json
        nix flake metadata --json 
        nix flake show --json --all-systems
        nix flake metadata --json > metadata.json 2> metadata.err || echo "nix flake metadata --json failed"
        nix flake show --json --all-systems > outputs.json 2> outputs.err || echo "nix flake show --json --all-systems failed"

        if [ ! -e metadata.json ]; then
            echo null > metadata.json
        fi
        if [ ! -e outputs.json ]; then
            echo null > outputs.json
        fi
      `,
      ])
      .withEnvVariable("VERSION", Deno.env.get("VERSION") || version)
      .withEnvVariable("REF", Deno.env.get("REF") || ref)
      .withSecretVariable("GH_TOKEN", (await getGithubToken(client, ghToken))!)
      .withEnvVariable("URL", Deno.env.get("URL") || url)
      .withEnvVariable(
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
        Deno.env.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN") ||
          actionsIdTokenRequestToken
      )
      .withEnvVariable(
        "ACTIONS_ID_TOKEN_REQUEST_URL",
        Deno.env.get("ACTIONS_ID_TOKEN_REQUEST_URL") || actionsIdTokenRequestUrl
      )
      .withEnvVariable(
        "IGNORE_CONFLICTS",
        Deno.env.get("IGNORE_CONFLICTS") || `${ignoreConflicts}`
      )
      .withExec([
        "bash",
        "-c",
        `\
        RESPONSE=$(curl -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=$URL")
        OIDC=$(echo $RESPONSE | jq -r '.value')
        README=$(find . -iname "README*" -maxdepth 1 -print -quit)

        nix run nixpkgs#jo \
          metadata=:metadata.json \
          metadata_error=@metadata.err \
          outputs=:outputs.json \
          outputs_errors=@outputs.err \
          readme="$README" \
          version="$VERSION" \
          ref="$REF" \
        > publish.json

        echo "Publishing to $URL"

        curl --fail-with-body -w '%{http_code}' -o /dev/stderr > http_code \
             -H 'Content-Type: application/json' \
             -H "Github-Token: $GH_TOKEN" \
             -H "Authorization: Bearer $OIDC" \
             -d @publish.json \
             -X POST $URL/api/publish \
        || ([ "$IGNORE_CONFLICTS" = 'true' ] && grep -qxF 409 http_code)
        `,
      ]);
    const stdout = await ctr.stdout();
    const stderr = await ctr.stderr();
    output = stdout + "\n" + stderr;
  });

  return output;
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
    ) => Promise<File | string>)
  | ((
      src: string | Directory,
      version: string,
      ref: string,
      ghToken: string,
      actionsIdTokenRequestToken: string,
      actionsIdTokenRequestUrl: string,
      url?: string,
      ignoreConflicts?: boolean
    ) => Promise<string>);

export const runnableJobs: Record<Job, JobExec> = {
  [Job.fmt]: fmt,
  [Job.lint]: lint,
  [Job.test]: test,
  [Job.compile]: compile,
  [Job.deploy]: deploy,
  [Job.publish]: publish,
};

export const jobDescriptions: Record<Job, string> = {
  [Job.fmt]: "Format your code",
  [Job.lint]: "Lint your code",
  [Job.test]: "Run your tests",
  [Job.compile]: "Compile your code",
  [Job.deploy]: "Deploy your code to Deno Deploy",
  [Job.publish]: "Publish Nix flake to flakestry.dev",
};
