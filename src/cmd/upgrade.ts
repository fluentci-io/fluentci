import { VERSION } from "../consts.ts";
import { yellow, green } from "../../deps.ts";

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

export async function checkForUpdate() {
  try {
    const result = await fetch("https://api.github.com/repos/fluentci-io/fluentci/releases/latest")
    const releaseInfo = await result.json()
 
   if (versionGreaterThan(releaseInfo.tag_name, VERSION)) {
      console.log(
    `${green('A new release of fluentci is available:')} ${VERSION} → ${releaseInfo.tag_name} \nTo upgrade: run fluentci upgrade\n${releaseInfo.url}
   `)
    }
  } catch (e) {
    console.log(`
      ${yellow('WARNING: ')} checking for udpate failed ${e}
    `)
  }
}

export const versionGreaterThan = (v1: string, v2: string): boolean => {
  const numbers1 = v1.replace('v', '').split('.').map(Number)
  const numbers2 = v2.replace('v', '').split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    if (numbers1[i] > numbers2[i]) {
      return true;
    }
  }

  return false;
}
