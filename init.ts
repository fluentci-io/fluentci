import { decompress } from "https://deno.land/x/zip@v1.2.5/mod.ts";
import {
  TerminalSpinner,
  SpinnerTypes,
} from "https://deno.land/x/spinners@v1.1.2/mod.ts";
import { green } from "https://deno.land/std@0.52.0/fmt/colors.ts";

const BASE_URL = "https://api.fluentci.io/v1";

async function init(
  { template, standalone }: { template?: string; standalone?: boolean },
  _name?: string
) {
  template = template || "base";
  if (!template.endsWith("_pipeline")) {
    template = template + "_pipeline";
  }

  const result = await fetch(`${BASE_URL}/pipeline/${template}`);
  const data = await result.json();
  if (data.github_url) {
    const archiveUrl = `${data.github_url.replace(
      "https://github.com",
      "https://codeload.github.com"
    )}/zip/refs/tags/${data.version}`;
    await download(archiveUrl, template);

    const repoName = data.github_url.split("/").pop();

    const outputDir = `${repoName}-${data.version.replace("v", "")}`;
    await copyDir(outputDir, standalone ? "." : ".fluentci");
    await Deno.remove(outputDir, { recursive: true });

    if (!standalone) {
      await setupDevbox();
    }

    return;
  }

  console.log(
    `Pipeline template ${green('"')}${green(template)}${green(
      '"'
    )} not found in Fluent CI registry`
  );
  Deno.exit(1);
}

async function copyDir(src: string, dest: string) {
  if (dest !== ".") {
    await Deno.mkdir(dest);
  }
  for await (const dirEntry of Deno.readDir(src)) {
    const srcPath = `${src}/${dirEntry.name}`;
    const destPath = `${dest}/${dirEntry.name}`;
    if (dirEntry.isDirectory) {
      await copyDir(srcPath, destPath);
    } else {
      await Deno.copyFile(srcPath, destPath);
    }
  }
}

async function download(url: string, template: string) {
  console.log("template:", url);

  const terminalSpinner = new TerminalSpinner({
    text: `Downloading ${green(template)} template ...`,
    spinner: SpinnerTypes.dots,
  });
  terminalSpinner.start();

  const tempFilePath = await Deno.makeTempFile();

  const response = await fetch(url);
  const value = await response.arrayBuffer();

  terminalSpinner.succeed("Downloaded template");

  Deno.writeFile(tempFilePath, new Uint8Array(value));

  await decompress(tempFilePath, ".");

  // Cleanup the temp file
  await Deno.remove(tempFilePath);
}

async function setupDevbox() {
  const devboxFiles = ["devbox.json", "devbox.lock"];
  for (const devboxFile of devboxFiles) {
    if (exists(`.fluentci/example/${devboxFile}`) && !exists(devboxFile)) {
      await Deno.copyFile(`.fluentci/example/${devboxFile}`, devboxFile);
    }
  }
}

function exists(file: string): boolean {
  try {
    return Deno.statSync(file).isFile;
  } catch (_) {
    return false;
  }
}

export default init;
