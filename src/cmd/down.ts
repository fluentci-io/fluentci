import { green, procfile } from "../../deps.ts";
import { getProcfiles, writeToSocket } from "../utils.ts";

export default async function down() {
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

      if (["mysql", "mariadb"].includes(service)) {
        const status = await new Deno.Command("fluentci", {
          args: ["run", "--wasm", service, "stop"],
          stdout: "inherit",
          stderr: "inherit",
        }).spawn().status;

        if (!status.success) {
          console.log(`Failed to stop ${green(service)}`);
          continue;
        }

        console.log(`Successfully stopped ${green(service)}`);
        continue;
      }

      try {
        await writeToSocket(socket, "stop\n");
      } catch (_e) {
        console.log(`Failed to stop ${green(service)}`);
        continue;
      }

      console.log(`Successfully stopped ${green(service)}`);
    }
  }
}
