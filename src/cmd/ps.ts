import { procfile, Table } from "../../deps.ts";
import { writeToSocket } from "../utils.ts";
import { getProcfiles, getServicePid } from "../utils.ts";

export default async function listServices() {
  const files = await getProcfiles();
  const services = [];
  // deno-lint-ignore no-explicit-any
  let infos: Record<string, any> = {};

  for (const file of files) {
    const manifest = procfile.parse(Deno.readTextFileSync(file));
    services.push(...Object.keys(manifest));
    infos = {
      ...infos,
      ...manifest,
    };

    for (const service of Object.keys(manifest)) {
      const socket = file.replace("Procfile", ".overmind.sock");
      infos[service].socket = socket;
      try {
        const response = await writeToSocket(socket, "status\n");
        infos[service].status = response.includes("running") ? "Up" : "Stopped";
      } catch (_e) {
        infos[service].status = "Stopped";
      }
    }
  }

  services.sort();

  const table = new Table();
  table.header(["PROCESS", "PID", "STATUS", "COMMAND"]);
  for (const service of services) {
    const pid = await getServicePid(service, infos[service].socket);
    table.push([
      service,
      pid,
      infos[service].status,
      infos[service].command + " " + infos[service].options.join(" "),
    ]);
  }
  table.render();
}
