import { VERSION } from "../consts.ts";
import { gray, green, semver, yellow } from "../../deps.ts";

/**
 * Upgrades FluentCI by installing the latest version from the Deno registry.
 * @returns {Promise<void>}
 */
async function upgrade() {
  const newVersionAvailable = await checkForUpdate({ checkUpdate: true });
  if (!newVersionAvailable) {
    console.log(
      `${green(
        "Congrats!"
      )} You are already on the latest version of fluentci ${gray(
        "(which is " + VERSION + ")"
      )}`
    );
    return;
  }

  const command = new Deno.Command("deno", {
    args: [
      "install",
      "--unstable-kv",
      "-A",
      "-r",
      "--import-map=https://deno.land/x/fluentci/import_map.json",
      "https://deno.land/x/fluentci/main.ts",
      "-n",
      "fluentci",
      "-f",
      "-g",
    ],
  });

  const { stdout, stderr } = await command.output();

  console.log(new TextDecoder().decode(stdout));
  console.log(new TextDecoder().decode(stderr));
}

export async function checkForUpdate(options: { checkUpdate: boolean }) {
  const { checkUpdate } = options;
  if (!checkUpdate) {
    return false;
  }

  try {
    const headers: Record<string, string> = {};

    if (Deno.env.has("GITHUB_ACCESS_TOKEN")) {
      headers["Authorization"] = `token ${Deno.env.get("GITHUB_ACCESS_TOKEN")}`;
    }

    const result = await fetch(
      "https://api.github.com/repos/fluentci-io/fluentci/releases/latest",
      {
        headers,
      }
    );
    const releaseInfo = await result.json();

    const latestVersion = semver.parse(releaseInfo.tag_name);
    const currentVersion = semver.parse(VERSION);

    if (semver.greaterThan(latestVersion, currentVersion)) {
      console.log(
        `${green("A new release of fluentci is available:")} ${VERSION} → ${
          releaseInfo.tag_name
        } \nTo upgrade: run fluentci upgrade\n${releaseInfo.url}
   `
      );
      return true;
    }
  } catch (e) {
    console.log(`
      ${yellow("WARNING: ")} checking for udpate failed ${e}
    `);
  }
  return false;
}

export default upgrade;
