import { createId, createYoga, cyan, green } from "../../deps.ts";
import { schema } from "../server/graphql/schema.ts";
import * as actions from "../server/kv/actions.ts";
import * as projects from "../server/kv/projects.ts";
import * as runs from "../server/kv/runs.ts";

function server({ port }: { port?: number }) {
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

  Deno.serve(
    {
      port: port || 6076,
      onListen: () => {
        const PORT = port || 6076;
        console.log(
          `${green("FluentCI API")} is up and running on ${cyan(
            `http://localhost:${PORT}/graphql`
          )}`
        );
      },
    },
    (req) => {
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
      return yoga(req);
    }
  );
}

export default server;
