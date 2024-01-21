import { VERSION } from "../consts.ts";
import { green, semver, yellow } from "../../deps.ts";

/**
 * Upgrades FluentCI by installing the latest version from the Deno registry.
 * @returns {Promise<void>}
 */
async function upgrade() {
  const command = new Deno.Command("deno", {
    args: [
      "install",
      "-A",
      "-r",
      "--import-map=https://deno.land/x/fluentci/import_map.json",
      "https://deno.land/x/fluentci/main.ts",
      "-n",
      "fluentci",
      "-f",
    ],
  });

  const { stdout, stderr } = await command.output();

  console.log(new TextDecoder().decode(stdout));
  console.log(new TextDecoder().decode(stderr));
}

export default upgrade;

export async function checkForUpdate(options: { checkUpdate: boolean }) {
  const { checkUpdate } = options;
  if (!checkUpdate) {
    return;
  }

  try {
    const result = await fetch(
      "https://api.github.com/repos/fluentci-io/fluentci/releases/latest",
    );
    const releaseInfo = await result.json();

    const latestVersion = semver.parse(releaseInfo.tag_name);
    const currentVersion = semver.parse(VERSION);

    if (semver.gt(latestVersion, currentVersion)) {
      console.log(
        `${
          green("A new release of fluentci is available:")
        } ${VERSION} → ${releaseInfo.tag_name} \nTo upgrade: run fluentci upgrade\n${releaseInfo.url}
   `,
      );
    }
  } catch (e) {
    console.log(`
      ${yellow("WARNING: ")} checking for udpate failed ${e}
    `);
  }
}
