import {
  Logger,
  brightGreen,
  dir,
  generateName,
  ZipReader,
  BlobReader,
} from "../../deps.ts";
import {
  FLUENTCI_WS_URL,
  RUNNER_URL,
  FLUENTCI_EVENTS_URL,
  BUILD_DIR,
} from "../consts.ts";

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

  const websocket = new WebSocket(`${FLUENTCI_WS_URL}?agent_id=${id}`);
  websocket.onopen = function () {
    logger.info(`Connected to FluentCI server as ${brightGreen(id)}`);
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

const exists = (path: string) => {
  try {
    Deno.statSync(path);
    return true;
  } catch (_) {
    return false;
  }
};

const extractZipBlob = async (
  blob: Blob,
  project_id: string,
  sha256: string
) => {
  const zipReader = new ZipReader(new BlobReader(blob));
  for (const entry of await zipReader.getEntries()) {
    const [_, ...path] = entry.filename.split("/").reverse();
    const stream = new TransformStream();
    const arrayBuffer = new Response(stream.readable).arrayBuffer();
    await entry.getData(stream.writable);
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
};

const spawnFluentCI = async (
  logger: Logger,
  project_id: string,
  sha256: string,
  pipeline: string,
  jobs: [string, ...Array<string>],
  clientId: string
) => {
  const command = new Deno.Command("dagger", {
    args: ["--progress", "plain", "run", "fluentci", "run", pipeline, ...jobs],
    cwd: `${dir("home")}/.fluentci/builds/${project_id}/${sha256}`,
    stdout: "piped",
    stderr: "piped",
    env: {
      _EXPERIMENTAL_DAGGER_CLOUD_URL: `https://events.fluentci.io?id=${
        "build-" + clientId
      }&project_id=${project_id}`,
      DAGGER_CLOUD_TOKEN: Deno.env.get("DAGGER_TOKEN") || "123",
    },
  });
  const process = command.spawn();
  const writable = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      logger.info(text);
      fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
        method: "POST",
        body: text,
      }).catch((e) => logger.error(e.message));
    },
  });

  await process.stderr?.pipeTo(writable);
  const { code } = await process.status;

  fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
    method: "POST",
    body: `fluentci_exit=${code}`,
  }).catch((e) => logger.error(e.message));
};

export default startAgent;
