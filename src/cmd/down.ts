import { green, procfile } from "../../deps.ts";

export default async function down() {
  const command = new Deno.Command("bash", {
    args: ["-c", "ls .fluentci/*/Procfile"],
    stdout: "piped",
  });
  const process = await command.spawn();
  const { stdout, success } = await process.output();
  if (!success) {
    console.log("No services running");
    Deno.exit(0);
  }
  const decoder = new TextDecoder();
  const files = decoder.decode(stdout).trim().split("\n");
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
        args: ["-c", `echo stop  | nc -U -w 1 ${socket}`],
        stdout: "piped",
      });
      const process = await command.spawn();
      const { success } = await process.output();
      if (!success) {
        console.log(`Failed to stop ${green(service)}`);
        continue;
      }
      console.log(`Successfully stopped ${green(service)}`);
    }
  }
}
