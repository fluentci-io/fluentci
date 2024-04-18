import { readAllSync, toml } from "../../deps.ts";
import { walk, ZipWriter, BlobWriter, brightGreen, wait } from "../../deps.ts";
import { currentPluginDirExists } from "../utils.ts";
import { isLogged, getAccessToken, setupRust } from "../utils.ts";
import { validatePackage, validateConfigFiles } from "../validate.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const REGISTRY_URL = "https://whole-badger-28.deno.dev";

const publish = async (
  options: Record<string, string | number | boolean | undefined> = {}
) => {
  if (!(await isLogged())) {
    console.log(
      `FLUENTCI_ACCESS_TOKEN is not set, Please login first with ${brightGreen(
        "`fluentci login`"
      )}`
    );
    Deno.exit(1);
  }

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

  if (paths.length === 0 && !options.wasm) {
    console.error("No files found in the current directory");
    Deno.exit(1);
  }

  if (paths.length > 1000 && !options.wasm) {
    console.error(
      `A FluentCI package can contain a maximum of ${brightGreen(
        "1000 files"
      )}, found ${paths.length}`
    );
    Deno.exit(1);
  }

  if (!validatePackage(paths.map((x) => x.path)) && !options.wasm) {
    console.error(
      `A valid FluentCI package must contain ${brightGreen(
        "mod.ts"
      )} and ${brightGreen("dagger.json")}`
    );
    Deno.exit(1);
  }

  if (!options.wasm) {
    validateConfigFiles();
  }

  if (options.wasm) {
    await publishWasm();
    return;
  }

  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter);

  for await (const { path, isFile } of paths) {
    console.log(path);
    if (isFile) {
      const file = await Deno.open(path);
      await zipWriter.add(path, file);
    }
  }

  await zipWriter.close();

  const spinner = wait("Publishing package...").start();

  const blob = await blobWriter.getData();
  const xhr = new XMLHttpRequest();
  xhr.open("POST", REGISTRY_URL);
  xhr.setRequestHeader("Content-Type", "application/zip");
  xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

  xhr.onload = function () {
    if (xhr.status != 200) {
      spinner.fail(`Failed to publish package, ${xhr.responseText}`);
    } else {
      spinner.succeed(brightGreen(" Package published successfully"));
    }
  };

  xhr.send(blob);
};

const parseIgnoredFiles = () => {
  let ignoredFilesArray: RegExp[] = [
    new RegExp("\\.git"),
    new RegExp("\\.fluentci"),
    new RegExp("plugin/target"),
  ];
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

const publishWasm = async () => {
  let pluginDir = ".";
  if (await currentPluginDirExists()) {
    pluginDir = "plugin";
  }

  await setupRust();

  const wasm32 = new Deno.Command("rustup", {
    args: ["target", "add", "wasm32-unknown-unknown"],
    stdout: "inherit",
    stderr: "inherit",
  });
  await spawnCommand(wasm32);

  const build = new Deno.Command("bash", {
    args: ["-c", "cargo build --target wasm32-unknown-unknown --release"],
    stderr: "inherit",
    stdout: "inherit",
    cwd: pluginDir,
  });
  await spawnCommand(build);

  const cargoToml = toml.parse(
    Deno.readTextFileSync(`${pluginDir}/Cargo.toml`)
    // deno-lint-ignore no-explicit-any
  ) as Record<string, any>;

  const spinner = wait("Publishing package...").start();

  const ls = new Deno.Command("bash", {
    args: [
      "-c",
      `ls ${pluginDir}/target/wasm32-unknown-unknown/release/${cargoToml.package.name.replaceAll(
        "-",
        "_"
      )}.wasm`,
    ],
    stderr: "piped",
    stdout: "piped",
  });
  const { stdout } = ls.outputSync();

  const file = await Deno.open(new TextDecoder().decode(stdout).trim(), {
    read: true,
  });
  const blob = readAllSync(file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${REGISTRY_URL}`);
  xhr.setRequestHeader("Content-Type", "application/wasm");
  xhr.setRequestHeader("Authorization", `Bearer ${getAccessToken()}`);
  xhr.setRequestHeader("Name", cargoToml.package.name);
  xhr.setRequestHeader("Version", cargoToml.package.version);
  xhr.onload = function () {
    if (xhr.status != 200) {
      spinner.fail(`Failed to publish package, ${xhr.responseText}`);
    } else {
      spinner.succeed(brightGreen(" Package published successfully"));
    }
  };

  xhr.send(blob);
};

const spawnCommand = async (command: Deno.Command) => {
  const child = command.spawn();
  if ((await child.status).code !== 0) {
    Deno.exit(1);
  }
};

export default publish;
