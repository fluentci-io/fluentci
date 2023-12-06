import { decompress } from "../../deps.ts";
import {
  TerminalSpinner,
  SpinnerTypes,
} from "https://deno.land/x/spinners@v1.1.2/mod.ts";
import { green } from "https://deno.land/std@0.52.0/fmt/colors.ts";

const BASE_URL = "https://api.fluentci.io/v1";

/**
 * Initializes a Fluent CI pipeline by fetching the specified template from the registry, downloading it, and copying it to the specified output directory.
 * @param {Object} options - The options for the initialization.
 * @param {string} [options.template="base"] - The name of the template to use for the pipeline.
 * @param {boolean} [options.standalone=false] - Whether to create a standalone pipeline or not.
 * @param {string} [_name] - The name of the pipeline.
 * @returns {Promise<void>}
 */
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
    const archiveUrl =
      data.version && data.version.startsWith("v")
        ? `${data.github_url.replace(
            "https://github.com",
            "https://codeload.github.com"
          )}/zip/refs/tags/${data.version}`
        : `${data.github_url.replace(
            "https://github.com",
            "https://api.github.com/repos"
          )}/zipball/${data.version || data.default_branch}`;

    await download(archiveUrl, template);

    const repoName = data.github_url.split("/").pop();

    let outputDir = `${repoName}-${data.version.replace("v", "")}`;

    if (data.directory) {
      outputDir += `/${data.directory}`;
      outputDir = `${data.owner}-${outputDir}`;
    }

    await copyDir(outputDir, standalone ? "." : ".fluentci");

    if (data.directory) {
      outputDir = outputDir.split("/")[0];
    }

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

/**
 * Copies a directory from the source to the destination.
 * @param src The source directory.
 * @param dest The destination directory.
 */
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

/**
 * Downloads a template from the specified URL and extracts it to the current directory.
 * @param url The URL of the template to download.
 * @param template The name of the template being downloaded.
 */
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

/**
 * Sets up the devbox configuration files.
 */
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
