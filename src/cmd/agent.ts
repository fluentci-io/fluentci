import {
  Logger,
  brightGreen,
  dir,
  generateName,
  ZipReader,
  BlobReader,
  Table,
  dayjs,
} from "../../deps.ts";
import {
  FLUENTCI_WS_URL,
  RUNNER_URL,
  FLUENTCI_EVENTS_URL,
  BUILD_DIR,
  VERSION,
} from "../consts.ts";
import {
  formatBytes,
  getAccessToken,
  getDaggerVersion,
  isLogged,
} from "../utils.ts";
import { hostname, release, cpus, arch, totalmem, platform } from "node:os";
import { Agent } from "../types.ts";
import O from "https://esm.sh/v133/mimic-fn@4.0.0/denonext/mimic-fn.mjs";

async function startAgent() {
  console.log(`
  .
      ______              __  _________
     / __/ /_ _____ ___  / /_/ ___/  _/
    / _// / // / -_) _ \\/ __/ /___/ /  
   /_/ /_/\\_,_/\\__/_//_/\\__/\\___/___/
   
  https://fluentci.io       
  `);
  const logger = new Logger();
  logger.info("Starting FluentCI Agent ...");

  let id = `${generateName()}_${Math.floor(Math.random() * 1000)}`;
  try {
    const data = await Deno.readFile(`${dir("home")}/.fluentci/agent-id`);
    id = new TextDecoder().decode(data);
  } catch (_) {
    await Deno.mkdir(`${dir("home")}/.fluentci`, { recursive: true });
    await Deno.writeTextFile(`${dir("home")}/.fluentci/agent-id`, id);
  }

  if (!(await isLogged())) {
    console.log("You need to login first before starting the agent");
    console.log(
      `Run ${brightGreen(
        "`fluentci login`"
      )} or set FLUENTCI_ACCESS_TOKEN env variable to login`
    );
    Deno.exit(1);
  }

  const uuid = await getWebSocketUuid(id);
  const websocket = new WebSocket(
    `${FLUENTCI_WS_URL}?agent_id=${id}&uuid=${uuid}`
  );
  websocket.onopen = function () {
    logger.info(`Connected to FluentCI server as ${brightGreen(id)}`);
    logger.info(`uuid: ${brightGreen(uuid)}`);
    logger.info("FluentCI Agent started successfully ✅");
    logger.info("Waiting for jobs ...");
    logger.info("Press Ctrl+C to exit");
  };
  websocket.addEventListener("message", async function (event) {
    try {
      logger.info(`Message from server ${event.data}`);
      const data = JSON.parse(event.data);
      const { action, src, query, buildId } = JSON.parse(data.event);
      const { jobs, pipeline } = JSON.parse(query);

      if (action === "build") {
        const project_id = src.split("/")[0];
        const sha256 = src.split("/")[1].replace(".zip", "");

        Deno.mkdirSync(`${dir("home")}/.fluentci/builds`, { recursive: true });

        if (exists(`${dir("home")}/.fluentci/builds/${project_id}/${sha256}`)) {
          logger.info(
            `${brightGreen(src)} already exists, skipping download ...`
          );
          await spawnFluentCI(
            logger,
            project_id,
            sha256,
            pipeline,
            jobs,
            buildId
          );
          return;
        }

        logger.info(`Downloading ${brightGreen(src)} ...`);

        const response = fetch(
          `${RUNNER_URL}?project_id=${project_id}&sha256=${sha256}`
        );
        const blob = await response.then((res) => res.blob());
        logger.info(`Extracting ${brightGreen(src)} ...`);
        await extractZipBlob(blob, project_id, sha256);
        await spawnFluentCI(
          logger,
          project_id,
          sha256,
          pipeline,
          jobs,
          buildId
        );
      }
    } catch (e) {
      logger.error(`Failed to parse message from server ${event.data}`);
      logger.error(e.message);
    }
  });
}

function exists(path: string) {
  try {
    Deno.statSync(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function extractZipBlob(blob: Blob, project_id: string, sha256: string) {
  const zipReader = new ZipReader(new BlobReader(blob));
  for (const entry of await zipReader.getEntries()) {
    const [_, ...path] = entry.filename.split("/").reverse();
    const stream = new TransformStream();
    const arrayBuffer = new Response(stream.readable).arrayBuffer();
    await entry.getData!(stream.writable);
    const data = await arrayBuffer;
    await Deno.mkdir(
      `${BUILD_DIR}/${project_id}/${sha256}/${path.reverse().join("/")}`,
      {
        recursive: true,
      }
    );
    await Deno.writeFile(
      `${BUILD_DIR}/${project_id}/${sha256}/${entry.filename}`,
      new Uint8Array(data)
    );
  }
}

async function spawnFluentCI(
  logger: Logger,
  project_id: string,
  sha256: string,
  pipeline: string,
  jobs: [string, ...Array<string>],
  clientId: string
) {
  const accessToken = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  const command = new Deno.Command("dagger", {
    args: ["--progress", "plain", "run", "fluentci", "run", pipeline, ...jobs],
    cwd: `${dir("home")}/.fluentci/builds/${project_id}/${sha256}`,
    stdout: "piped",
    stderr: "piped",
    env: {
      _EXPERIMENTAL_DAGGER_CLOUD_URL: `https://events.fluentci.io?id=${
        "build-" + clientId
      }&project_id=${project_id}`,
      DAGGER_CLOUD_TOKEN: Deno.env.get("DAGGER_CLOUD_TOKEN") || "123",
    },
  });
  const process = command.spawn();
  let logs = "";
  const writable = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      logger.info(text);
      logs = logs.concat(text);
      fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
        method: "POST",
        body: text,
        headers,
      }).catch((e) => logger.error(e.message));
    },
  });

  await process.stderr?.pipeTo(writable);
  const { code } = await process.status;

  Promise.all([
    fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
      method: "POST",
      body: `fluentci_exit=${code}`,
      headers,
    }),
    fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
      method: "POST",
      body: `fluentci_logs=${logs}`,
      headers,
    }),
  ]).catch((e) => logger.error(e.message));
}

async function getWebSocketUuid(agentId: string) {
  const accessToken = await getAccessToken();
  const daggerVersion = await getDaggerVersion();
  const uuid = await fetch(
    `${FLUENTCI_EVENTS_URL}/auth?agent_id=${agentId}&hostname=${hostname()}&release=${release()}&cpus=${
      cpus().length
    }&arch=${arch()}&totalmem=${totalmem()}&platform=${platform()}&version=${VERSION}&pid=${
      Deno.pid
    }&daggerversion=${daggerVersion}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  ).then((res) => res.text());
  return uuid;
}

export async function listAgents() {
  const accessToken = await getAccessToken();
  const userId = await fetch(
    `https://api.fluentci.io/validate?token=${accessToken}`
  ).then((res) => res.text());
  const agents: Agent[] = await fetch(
    `${FLUENTCI_EVENTS_URL}/agents?id=${userId}`
  ).then((res) => res.json());

  if (!agents.length) {
    console.log("No agents found");
    return;
  }

  const table = new Table();
  table.header([
    "NAME",
    "HOSTNAME",
    "CPUs",
    "ARCH",
    "RAM",
    "OS",
    "VERSION",
    "PID",
    "DAGGER",
    "STARTED AT",
  ]);
  for (const agent of agents) {
    const totalmem = agent.totalmem === 0 ? "" : formatBytes(agent.totalmem);
    table.push([
      agent.agent_id,
      agent.hostname,
      agent.cpus,
      agent.arch,
      totalmem,
      agent.platform,
      agent.version,
      agent.pid,
      agent.daggerVersion,
      dayjs(agent.startedAt).fromNow(),
    ]);
  }

  table.render();
}

export default startAgent;
