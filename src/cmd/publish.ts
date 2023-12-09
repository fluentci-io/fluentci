import {
  walkSync,
  ZipWriter,
  BlobWriter,
  brightGreen,
  wait,
} from "../../deps.ts";
import { validatePackage, validateConfigFiles } from "../validate.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const REGISTRY_URL = "https://whole-badger-28.deno.dev";

const publish = async () => {
  const entries = walkSync(".", {
    skip: parseIgnoredFiles(),
  });
  const paths = [];

  for await (const entry of entries) {
    paths.push({
      path: entry.path,
      isFile: entry.isFile,
    });
  }

  if (!validatePackage(paths.map((x) => x.path))) {
    console.error(
      `A valid FluentCI package must contain ${brightGreen(
        "mod.ts"
      )} and ${brightGreen("dagger.json")}`
    );
    Deno.exit(1);
  }

  validateConfigFiles();

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

  xhr.onload = function () {
    if (xhr.status != 200) {
      console.log("Error " + xhr.status + ": " + xhr.statusText);
    } else {
      spinner.succeed(brightGreen(" Package published successfully"));
    }
  };

  xhr.send(blob);
};

const parseIgnoredFiles = () => {
  let ignoredFilesArray: RegExp[] = [
    new RegExp(".git"),
    new RegExp(".fluentci"),
  ];
  try {
    // verify if .fluentciignore exists
    if (Deno.statSync(".fluentciignore").isFile) {
      const ignoredFiles = Deno.readTextFileSync(".fluentciignore");
      ignoredFilesArray = ignoredFilesArray.concat(
        ignoredFiles.split("\n").map((file) => new RegExp(file))
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

export default publish;
