import {
  _,
  createYoga,
  open,
  createId,
  green,
  cyan,
  dockernames,
} from "../../deps.ts";
import { schema } from "../server/graphql/schema.ts";
import * as actions from "../server/kv/actions.ts";
import * as projects from "../server/kv/projects.ts";
import * as runs from "../server/kv/runs.ts";
import icons from "../server/icons.ts";

async function studio({ port }: { port?: number }) {
  const sockets: Record<string, WebSocket> = {};

  const yoga = createYoga({
    schema,
    context: () => {
      return {
        sockets,
        kv: {
          actions,
          projects,
          runs,
        },
      };
    },
  });
  let projectId = createId();
  const project = await projects.at(Deno.cwd());

  if (!project) {
    let name = dockernames.getRandomName().replaceAll("_", "-");
    let suffix = 1;

    do {
      const project = await projects.byName(name);
      if (!project) {
        break;
      }
      name = `${name}-${suffix}`;
      suffix++;
    } while (true);

    const icon = _.sample(icons);

    await projects.save({
      id: projectId,
      path: Deno.cwd(),
      name,
      createdAt: new Date().toISOString(),
      picture: `https://img.icons8.com/parakeet/96/${icon}.png`,
    });
  } else {
    projectId = project.id;
  }

  const FLUENTCI_STUDIO_PORT = Deno.env.get("FLUENTCI_STUDIO_PORT") || "6077";
  const child = new Deno.Command("fluentci-studio", {
    stdout: "inherit",
    stderr: "inherit",
    env: {
      FLUENTCI_STUDIO_PORT,
    },
  }).spawn();

  child.status.then(({ code }) => {
    if (code !== 0) {
      console.error("Failed to start FluentCI Studio");
      Deno.exit(1);
    }
  });

  Deno.serve(
    {
      port: port || 6076,
      onListen: () => {
        const PORT = port || 6076;
        console.log(
          `${green("FluentCI Studio")} is up and running on ${cyan(
            `http://localhost:${PORT}`
          )}`
        );
        open(`http://localhost:${PORT}/project/${projectId}`).catch((err) => {
          console.error(err);
        });
      },
    },
    async (req) => {
      const upgrade = req.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() === "websocket") {
        const ws = Deno.upgradeWebSocket(req);
        const id = createId();
        sockets[id] = ws.socket;

        sockets[id].onmessage = (e) => {
          if (e.data !== "ping") {
            console.log("> socket message:", e.data);
          }
          sockets[id]?.send(new Date().toString());
        };
        sockets[id].onerror = (e) =>
          console.log("socket errored:", (e as unknown as Error).message);
        sockets[id].onclose = () => delete sockets[id];

        return ws.response;
      }

      const url = new URL(req.url);
      if (
        url.pathname.endsWith("/graphql") ||
        url.pathname.endsWith("/graphiql")
      ) {
        return yoga(req);
      }
      url.protocol = "http";
      url.hostname = "127.0.0.1";
      url.port = FLUENTCI_STUDIO_PORT;

      return await fetch(url.href, {
        headers: req.headers,
        method: req.method,
        body: req.body,
      });
    }
  );
}

export default studio;
