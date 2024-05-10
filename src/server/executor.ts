import { Context } from "./graphql/context.ts";
import { Action } from "./graphql/objects/action.ts";

export default async function run(ctx: Context, actions: Action[]) {
  for (const action of actions) {
    if (!action.enabled) {
      continue;
    }

    for (const cmd of action.commands.split("\n")) {
      await spawn(
        ctx,
        `fluentci run ${action.useWasm ? "--wasm" : ""} ${action.plugin} ${cmd}`
      );
    }
  }
}

async function spawn(ctx: Context, cmd: string) {
  const child = new Deno.Command("bash", {
    args: ["-c", cmd],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const writable = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      ctx.socket?.send(text);
    },
  });

  await child.stdout.pipeTo(writable);

  if ((await child.status).code !== 0) {
    console.error("Failed to run the command");
  }
}
