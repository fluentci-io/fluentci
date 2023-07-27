import { downstream } from "downstream";
import { ProgressBar } from "https://deno.land/x/downstream@0.3.3/deps/_progressbar.ts";
import { decompress } from "https://deno.land/x/zip@v1.2.5/mod.ts";

const BASE_URL = "https://api.fluentci.io/v1";

async function init(template = "base") {
  if (!template.endsWith("-pipeline")) {
    template = template + "-pipeline";
  }

  const result = await fetch(`${BASE_URL}/pipeline/${template}`);
  const data = await result.json();
  if (data.github_url) {
    const archiveUrl = `${data.github_url.replace(
      "https://github.com",
      "https://codeload.github.com"
    )}/zip/refs/tags/${data.version}`;
    await download(archiveUrl);

    const outputDir = `${data.name}-${data.version.replace("v", "")}`;
    await copyDir(outputDir, ".fluentci");
    await Deno.remove(outputDir, { recursive: true });

    return;
  }

  async function download(url: string) {
    console.log("template:", url);
    const { progressStream, fileStream } = await downstream(url);

    const progressBar = new ProgressBar({
      title: "downloading: ",
      total: 100,
    });

    const tempFilePath = await Deno.makeTempFile();
    const tempFile = await Deno.open(tempFilePath, { write: true });
    const fileHandlingPromise = fileStream.pipeTo(tempFile.writable);

    for await (const progress of progressStream) {
      progressBar.render(Number.parseFloat(progress));
    }

    // Await the file handling promise from step 3
    await fileHandlingPromise;

    await decompress(tempFilePath, ".");

    // Cleanup the temp file
    await Deno.remove(tempFilePath);
  }
}

async function copyDir(src: string, dest: string) {
  await Deno.mkdir(dest);
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

export default init;
