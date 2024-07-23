import { green, procfile } from "../../deps.ts";
import { getProcfiles } from "../utils.ts";

export default async function up() {
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
      const command = new Deno.Command("sh", {
        args: ["-c", `echo restart | nc -U -w 1 ${socket}`],
        stdout: "piped",
      });
      const process = await command.spawn();
      const { success } = await process.output();
      if (!success) {
        console.log(`Failed to start ${green(service)}`);
        continue;
      }
      console.log(`Successfully started ${green(service)}`);
    }
  }
}
