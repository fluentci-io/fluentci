import { dir } from "../deps.ts";

export async function isLogged(): Promise<boolean> {
  if (Deno.env.get("FLUENTCI_ACCESS_TOKEN")) {
    const accessToken = Deno.env.get("FLUENTCI_ACCESS_TOKEN");
    const status = await fetch(
      `https://api.fluentci.io/validate?token=${accessToken}`
    ).then((res) => res.status);
    return status === 200;
  }
  try {
    const accessToken = Deno.readTextFileSync(
      `${Deno.env.get("HOME")}/.fluentci/access-token`
    );
    const status = await fetch(
      `https://api.fluentci.io/validate?token=${accessToken}`
    ).then((res) => res.status);
    return status === 200;
  } catch (_a) {
    return false;
  }
}

export function getAccessToken(): string | undefined {
  if (Deno.env.get("FLUENTCI_ACCESS_TOKEN")) {
    return Deno.env.get("FLUENTCI_ACCESS_TOKEN");
  }
  try {
    const accessToken = Deno.readTextFileSync(
      `${dir("home")}/.fluentci/access-token`
    );
    return accessToken;
  } catch (_) {
    return undefined;
  }
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

export function extractVersion(name: string): string {
  const version = name.split("@").pop();
  if (version && name.split("@").length === 2) {
    if (
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta)\.([1-9]\d*|0))?$/g.test(
        version
      )
    ) {
      return version.startsWith("v") ? version : `v${version}`;
    }
    console.log('Invalid version format. Please use "vX.X.X" format.');
    Deno.exit(1);
  }
  return "latest";
}

export async function getDaggerVersion(): Promise<string> {
  const command = new Deno.Command("dagger", {
    args: ["version"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await command.output();
  const version = new TextDecoder().decode(stdout).trim().split(" ")[1];
  return version;
}

export async function fluentciDirExists(): Promise<boolean> {
  try {
    const fluentciDir = await Deno.stat(".fluentci");
    return fluentciDir.isDirectory;
  } catch (_) {
    return false;
  }
}
