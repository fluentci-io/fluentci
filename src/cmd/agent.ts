import {
  Logger,
  brightGreen,
  dir,
  generateName,
  ZipReader,
  BlobReader,
  Table,
  dayjs,
  createId,
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
import { Action, Agent, Log, Run } from "../types.ts";

const accessToken = await getAccessToken();
const headers = {
  Authorization: `Bearer ${accessToken}`,
};

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
      const { action, src, query, runId, actions, run } = JSON.parse(
        data.event
      );
      const { jobs, pipeline, wasm } = JSON.parse(query);

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
            runId,
            wasm,
            actions,
            run
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
          runId,
          wasm,
          actions,
          run
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
  clientId: string,
  wasm: boolean = false,
  actions: Action[] = [],
  run?: Run
) {
  if (actions.length > 0) {
    await executeActions(actions, project_id, sha256, run!, logger, clientId);
    return;
  }

  const command = wasm
    ? new Deno.Command("fluentci", {
        args: [
          "run",
          "--wasm",
          pipeline,
          ...jobs.filter((x) => x !== "--remote-exec"),
        ],
        cwd: `${dir("home")}/.fluentci/builds/${project_id}/${sha256}`,
        stdout: "piped",
        stderr: "piped",
      })
    : new Deno.Command("dagger", {
        args: [
          "--progress",
          "plain",
          "run",
          "fluentci",
          "run",
          pipeline,
          ...jobs.filter((x) => x !== "--remote-exec"),
        ],
        cwd: `${dir("home")}/.fluentci/builds/${project_id}/${sha256}`,
        stdout: "piped",
        stderr: "piped",
      });
  const process = command.spawn();
  let logs = "";
  const writableStdoutStream = new WritableStream({
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
  const writableStderrStream = new WritableStream({
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

  const [_stdout, _stderr, { code }] = await Promise.all([
    process.stdout?.pipeTo(writableStdoutStream),
    process.stderr?.pipeTo(writableStderrStream),
    process.status,
  ]);

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

async function executeActions(
  actions: Action[],
  project_id: string,
  sha256: string,
  run: Run,
  logger: Logger,
  clientId: string
) {
  let currentActionIndex = 0;
  const runStart = dayjs();
  let jobs = [...run.jobs];

  // send update run status "RUNNING" + date
  sendEvent(clientId, "run", {
    ...run,
    status: "RUNNING",
    date: new Date().toISOString(),
  }).catch((e) => logger.error(e.message));

  for (const action of actions) {
    if (!action.enabled) {
      currentActionIndex += 1;
      continue;
    }

    const start = dayjs();
    const logs: Log[] = [];

    jobs = jobs.map((job, j) => ({
      ...job,
      startedAt:
        currentActionIndex === j ? start.toISOString() : job.started_at,
      status: currentActionIndex === j ? "RUNNING" : job.status,
    }));

    // send update job status "RUNNING" + date
    sendEvent(clientId, "job", {
      ...jobs[currentActionIndex],
      startedAt: start.toISOString(),
      status: "RUNNING",
    }).catch((e) => logger.error(e.message));

    for (const cmd of action.commands.split("\n")) {
      const result = await spawn(
        `fluentci run ${action.use_wasm ? "--wasm" : ""} ${
          action.plugin
        } ${cmd}`,
        `${dir("home")}/.fluentci/builds/${project_id}/${sha256}`,
        jobs[currentActionIndex].id,
        logger,
        clientId
      );

      logs.push(...result.logs);

      if (result.code !== 0) {
        // send update job status "FAILURE" + duration + logs
        sendEvent(clientId, "job", {
          ...jobs[currentActionIndex],
          status: "FAILURE",
          duration: dayjs().diff(start, "milliseconds"),
          logs: [...(jobs[currentActionIndex].logs || []), ...logs],
        }).catch((e) => logger.error(e.message));

        jobs = jobs.map((job, j) => ({
          ...job,
          status: currentActionIndex === j ? "FAILURE" : job.status,
          duration:
            currentActionIndex === j
              ? dayjs().diff(start, "milliseconds")
              : job.duration,
          logs:
            currentActionIndex === j
              ? [...(job.logs || []), ...result.logs]
              : job.logs,
        }));
        const duration = dayjs().diff(runStart, "milliseconds");
        // send update run status "FAILURE" + duration
        sendEvent(clientId, "run", {
          ...run!,
          jobs,
          status: "FAILURE",
          duration,
        }).catch((e) => logger.error(e.message));

        // send update project stats
        sendEvent(clientId, "update-stats", {}).catch((e) =>
          logger.error(e.message)
        );

        fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
          method: "POST",
          body: `fluentci_exit=1`,
          headers,
        }).catch((e) => logger.error(e.message));
        return;
      }
    }

    jobs = jobs.map((job, j) => ({
      ...job,
      status: currentActionIndex === j ? "SUCCESS" : job.status,
      duration:
        currentActionIndex === j
          ? dayjs().diff(start, "milliseconds")
          : job.duration,
      logs:
        currentActionIndex === j ? [...(job.logs || []), ...logs] : job.logs,
    }));

    dayjs().diff(start, "milliseconds");
    // send update run jobs
    sendEvent(clientId, "run", {
      ...run!,
      jobs,
    });
    currentActionIndex += 1;
  }

  // update run status "SUCCESS" + duration
  const duration = dayjs().diff(runStart, "milliseconds");
  sendEvent(clientId, "run", {
    ...run!,
    status: "SUCCESS",
    duration,
  }).catch((e) => logger.error(e.message));

  // update project stats
  sendEvent(clientId, "update-stats", {}).catch((e) => logger.error(e.message));

  fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
    method: "POST",
    body: `fluentci_exit=0`,
    headers,
  }).catch((e) => logger.error(e.message));
}

async function spawn(
  cmd: string,
  cwd = Deno.cwd(),
  jobId: string,
  logger: Logger,
  clientId: string
) {
  const logs: Log[] = [];
  const child = new Deno.Command("bash", {
    args: ["-c", cmd],
    stdout: "piped",
    stderr: "piped",
    cwd,
  }).spawn();

  const writableStdoutStream = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      console.log(text);

      fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
        method: "POST",
        body: text,
        headers,
      }).catch((e) => logger.error(e.message));

      const log: Log = {
        id: createId(),
        jobId,
        message: text,
        createdAt: new Date().toISOString(),
      };
      logs.push(log);
      // send logs to the client
      sendEvent(clientId, "logs", { text, jobId }).catch((e) =>
        logger.error(e.message)
      );
    },
  });

  const writableStderrStream = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      console.log(text);

      fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
        method: "POST",
        body: text,
        headers,
      }).catch((e) => logger.error(e.message));

      const log: Log = {
        id: createId(),
        jobId: jobId!,
        message: text,
        createdAt: new Date().toISOString(),
      };
      logs.push(log);
      // send logs to the client
      sendEvent(clientId, "logs", { text, jobId }).catch((e) =>
        logger.error(e.message)
      );
    },
  });

  const [_stdout, _stderr, { code }] = await Promise.all([
    child.stdout.pipeTo(writableStdoutStream),
    child.stderr.pipeTo(writableStderrStream),
    child.status,
  ]);

  return { logs, code };
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

// deno-lint-ignore no-explicit-any
const sendEvent = (clientId: string, channel: string, data: any) =>
  fetch(`${FLUENTCI_EVENTS_URL}?client_id=${clientId}`, {
    method: "POST",
    body: JSON.stringify({
      channel,
      data,
    }),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });

export default startAgent;
