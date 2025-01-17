import { createId } from "../deps.ts";
import { dir, brightGreen, wait, green, procfile } from "../deps.ts";

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
    await Deno.stat(".fluentci/mod.ts");
    return fluentciDir.isDirectory;
  } catch (_) {
    return false;
  }
}

export async function currentPluginDirExists(): Promise<boolean> {
  try {
    const fluentciDir = await Deno.stat("plugin");
    await Deno.stat("plugin/Cargo.toml");
    return fluentciDir.isDirectory;
  } catch (_) {
    return false;
  }
}

export async function verifyRequiredDependencies(
  dependencies = ["deno", "dagger", "docker"]
) {
  for (const dependency of dependencies) {
    const command = new Deno.Command("sh", {
      args: ["-c", `type ${dependency}`],
      stdout: "piped",
      stderr: "piped",
    });
    const process = await command.spawn();
    const { code } = await process.status;

    if (code !== 0) {
      switch (dependency) {
        case "deno":
          await installDeno();
          break;
        case "dagger":
          await installDagger();
          break;
        default:
          console.log(
            `${brightGreen(
              dependency
            )} is not installed. Please install it before running this command.`
          );
          Deno.exit(1);
      }
    }
  }
}

async function installDeno() {
  console.log(`${brightGreen("Deno")} is not installed`);
  console.log("Downloading and installing Deno...");

  const command = new Deno.Command("sh", {
    args: ["-c", "curl -fsSL https://deno.land/install.sh | sh"],
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log("Failed to install Deno.");
    Deno.exit(1);
  }

  Deno.env.set("DENO_INSTALL", `${Deno.env.get("HOME")}/.deno`);
  Deno.env.set(
    "PATH",
    `${Deno.env.get("DENO_INSTALL")}/bin:${Deno.env.get("PATH")}`
  );
  console.log("Deno installed successfully");
}

async function installDagger() {
  console.log(`${brightGreen("Dagger")} is not installed. Installing...`);
  console.log("Downloading and installing Dagger...");

  const command = new Deno.Command("sh", {
    args: [
      "-c",
      `curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.9.11 sh &&
      if ! command -v sudo >/dev/null 2>&1; then mv bin/dagger /usr/local/bin; else sudo mv bin/dagger /usr/local/bin; fi &&
      rmdir bin || true
      `,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log("Failed to install Dagger.");
    Deno.exit(1);
  }

  console.log("Dagger installed successfully");
}

export async function setupPkgx() {
  await Deno.mkdir(`${Deno.env.get("HOME")}/.local/bin`, { recursive: true });
  Deno.env.set(
    "PATH",
    `${Deno.env.get("HOME")}/.local/bin:${Deno.env.get("PATH")}`
  );
  const spinner = wait("Setting up pkgx...").start();
  const command = new Deno.Command("bash", {
    args: [
      "-c",
      `type pkgx >/dev/null 2>&1 || curl -Ssf https://pkgx.sh | sh`,
    ],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log("Failed to install pkgx.");
    Deno.exit(1);
  }

  spinner.succeed("Pkgx setup complete");
}

export async function setupRust() {
  Deno.env.set(
    "PATH",
    `${Deno.env.get("HOME")}/.cargo/bin:${Deno.env.get("PATH")}`
  );
  const command = new Deno.Command("bash", {
    args: [
      "-c",
      `type rustup >/dev/null 2>&1 || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log("Failed to install Rust.");
    Deno.exit(1);
  }
}

export async function setupFluentCIengine() {
  await setupPkgx();
  let FLUENTCI_ENGINE_VERSION = Deno.env.get("FLUENTCI_ENGINE_VERSION");

  if (!FLUENTCI_ENGINE_VERSION) {
    const headers: Record<string, string> = {};

    if (Deno.env.has("GITHUB_ACCESS_TOKEN")) {
      headers["Authorization"] = `token ${Deno.env.get("GITHUB_ACCESS_TOKEN")}`;
    }

    FLUENTCI_ENGINE_VERSION = await fetch(
      "https://api.github.com/repos/fluentci-io/fluentci-engine/releases/latest",
      {
        headers,
      }
    )
      .then((res) => res.json())
      .then((data) => data.tag_name)
      .catch(() => {
        console.error("Failed to fetch latest release.");
        Deno.exit(1);
      });
  }

  if (!FLUENTCI_ENGINE_VERSION) {
    console.error("Failed to fetch latest release.");
    Deno.exit(1);
  }

  if (!FLUENTCI_ENGINE_VERSION.startsWith("v")) {
    FLUENTCI_ENGINE_VERSION = `v${FLUENTCI_ENGINE_VERSION}`;
  }

  const target = Deno.build.target;
  const command = new Deno.Command("bash", {
    args: [
      "-c",
      `\
    [ -n "$FORCE_FLUENTCI_ENGINE_INSTALL" ] && type fluentci-engine >/dev/null 2>&1 && rm \`which fluentci-engine\`;
    type fluentci-engine >/dev/null 2>&1 || pkgx wget@1.21.4 https://github.com/fluentci-io/fluentci-engine/releases/download/${FLUENTCI_ENGINE_VERSION}/fluentci-engine_${FLUENTCI_ENGINE_VERSION}_${target}.tar.gz;
    type fluentci-engine >/dev/null 2>&1 || pkgx tar xvf fluentci-engine_${FLUENTCI_ENGINE_VERSION}_${target}.tar.gz;
    type fluentci-engine >/dev/null 2>&1 || rm fluentci-engine_${FLUENTCI_ENGINE_VERSION}_${target}.tar.gz;
    mkdir -p $HOME/.local/bin;
    type fluentci-engine >/dev/null 2>&1 || mv fluentci-engine $HOME/.local/bin;`,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log("Failed to install FluentCI Engine.");
    Deno.exit(1);
  }
}

export async function setupFluentCIStudio() {
  await setupPkgx();

  let FLUENTCI_STUDIO_VERSION = Deno.env.get("FLUENTCI_STUDIO_VERSION");

  const headers: Record<string, string> = {};

  if (Deno.env.has("GITHUB_ACCESS_TOKEN")) {
    headers["Authorization"] = `token ${Deno.env.get("GITHUB_ACCESS_TOKEN")}`;
  }

  if (!FLUENTCI_STUDIO_VERSION) {
    FLUENTCI_STUDIO_VERSION = await fetch(
      "https://api.github.com/repos/fluentci-io/fluentci-studio/releases/latest",
      {
        headers,
      }
    )
      .then((res) => res.json())
      .then((data) => data.tag_name)
      .catch(() => {
        console.error("Failed to fetch latest release.");
        Deno.exit(1);
      });
  }

  if (!FLUENTCI_STUDIO_VERSION) {
    console.error("Failed to fetch latest release.");
    Deno.exit(1);
  }

  if (!FLUENTCI_STUDIO_VERSION.startsWith("v")) {
    FLUENTCI_STUDIO_VERSION = `v${FLUENTCI_STUDIO_VERSION}`;
  }

  const target = Deno.build.target;
  const command = new Deno.Command("bash", {
    args: [
      "-c",
      `\
    [ -n "$FORCE_FLUENTCI_STUDIO_INSTALL" ] && type fluentci-studio >/dev/null 2>&1 && rm \`which fluentci-studio\`;
    type fluentci-studio >/dev/null 2>&1 || pkgx wget@1.21.4 https://dl.fluentci.io/fluentci-studio/${FLUENTCI_STUDIO_VERSION}/fluentci-studio_${FLUENTCI_STUDIO_VERSION}_${target}.tar.gz;
    type fluentci-studio >/dev/null 2>&1 || pkgx tar xvf fluentci-studio_${FLUENTCI_STUDIO_VERSION}_${target}.tar.gz;
    type fluentci-studio >/dev/null 2>&1 || rm fluentci-studio_${FLUENTCI_STUDIO_VERSION}_${target}.tar.gz;
    mkdir -p $HOME/.local/bin;
    type fluentci-studio >/dev/null 2>&1 || chmod a+x fluentci-studio
    type fluentci-studio >/dev/null 2>&1 || mv fluentci-studio $HOME/.local/bin;`,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log("Failed to install FluentCI Studio.");
    Deno.exit(1);
  }
}

export async function fluentciPluginDirExists(cwd = "."): Promise<boolean> {
  try {
    const fluentciDir = await Deno.stat(`${cwd}/.fluentci/plugin`);
    await Deno.stat(`${cwd}/.fluentci/plugin/Cargo.toml`);
    return fluentciDir.isDirectory;
  } catch (_) {
    return false;
  }
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    const dir = await Deno.stat(path);
    return dir.isDirectory;
  } catch (_) {
    return false;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    const file = await Deno.stat(path);
    return file.isFile;
  } catch (_) {
    return false;
  }
}

export function sendSocketMessage(socket: WebSocket, message: string) {
  if (socket.readyState === WebSocket.CLOSED) {
    console.log("socket closed");
    return;
  }
  socket.send(message);
}

export async function bash(
  strings: TemplateStringsArray,
  ...values: (string | number)[]
) {
  let cmd = "";
  strings.forEach((string, i) => {
    cmd += string;
    if (i < values.length) {
      cmd += values[i];
    }
  });
  const command = new Deno.Command("bash", {
    args: ["-c", cmd],
    stdout: "inherit",
    stderr: "inherit",
  });

  const process = await command.spawn();
  const { code } = await process.status;

  if (code !== 0) {
    console.log(`Failed to run command: ${cmd}`);
    Deno.exit(1);
  }
}

export async function getProcfiles(cwd = ".", exit = true): Promise<string[]> {
  const command = new Deno.Command("bash", {
    args: ["-c", "ls .fluentci/*/Procfile 2> /dev/null"],
    stdout: "piped",
    cwd,
  });
  const process = await command.spawn();
  const { stdout, success } = await process.output();
  if (!success) {
    console.log("No services running");
    if (exit) Deno.exit(0);
    return [];
  }

  const decoder = new TextDecoder();
  return decoder.decode(stdout).trim().split("\n");
}

export async function getServicePid(
  name: string,
  socket: string
): Promise<string | undefined> {
  try {
    const response = await writeToSocket(socket, "status\n");
    const lines = response.replaceAll("\x00", "").trim().split("\n");
    return lines
      .find((line) => line.startsWith(name + " "))
      ?.split(" ")
      ?.filter((x) => x)[1];
  } catch (_e) {
    return "";
  }
}

export async function writeToSocket(
  socket: string,
  message: string,
  stream = false
): Promise<string> {
  const conn = await Deno.connect({ transport: "unix", path: socket });
  await conn.write(new TextEncoder().encode(message));

  if (["stop", "restart"].includes(message.trim())) {
    conn.close();
    return "";
  }

  if (stream) {
    while (true) {
      const buf = new Uint8Array(1024);
      const bytesRead = await conn.read(buf);
      if (bytesRead === null) break;
      console.log(new TextDecoder().decode(buf));
    }
    conn.close();
    return "";
  }

  let data = "";
  while (true) {
    const buf = new Uint8Array(1024);
    const bytesRead = await conn.read(buf);
    if (bytesRead === null) break;
    data += new TextDecoder().decode(buf);
  }
  conn.close();
  return data;
}

export async function stopServices(cwd: string) {
  const files = await getProcfiles(cwd, false);
  const services = [];
  // deno-lint-ignore no-explicit-any
  let infos: Record<string, any> = {};
  const id = createId();

  if (cwd.length > 64) {
    const ln = new Deno.Command("bash", {
      args: ["-c", `ln -s ${cwd} $HOME/${id}`],
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
    await ln.status;
  }

  const home = Deno.env.get("HOME")!;

  for (const file of files) {
    const manifest = procfile.parse(Deno.readTextFileSync(cwd + "/" + file));
    services.push(...Object.keys(manifest));
    infos = {
      ...infos,
      ...manifest,
    };

    for (const service of Object.keys(manifest)) {
      const socket = file.replace("Procfile", ".overmind.sock");

      if (["mysql", "mariadb"].includes(service)) {
        const status = await new Deno.Command("sh", {
          args: ["-c", `fluentci run --wasm ${service} stop`],
          stdout: "inherit",
          stderr: "inherit",
          cwd
        }).spawn().status;

        if (!status.success) {
          console.log(`Failed to stop ${green(service)}`);
          continue;
        }

        console.log(`Successfully stopped ${green(service)}`);
        continue;
      }

      try {
        await writeToSocket(
          (cwd.length > 64 ? `${home}/${id}` : cwd) + "/" + socket,
          "stop\n"
        );
      } catch (e) {
        console.log(`Failed to stop ${green(service)}`);
        console.log(e);
        console.log((cwd.length > 64 ? `${home}/${id}` : cwd) + "/" + socket);
        continue;
      }

      console.log(`Successfully stopped ${green(service)}`);
    }
  }

  if (cwd.length > 64) {
    const rm = new Deno.Command("bash", {
      args: ["-c", `rm $HOME/${id}`],
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
    await rm.status;
  }
}
