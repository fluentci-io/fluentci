import { Context } from "./graphql/context.ts";
import { Action } from "./graphql/objects/action.ts";
import { Run } from "./graphql/objects/run.ts";
import { createId, dayjs } from "../../deps.ts";
import { Log } from "./graphql/objects/log.ts";

export default async function run(ctx: Context, actions: Action[], data: Run) {
  let i = 0;
  const runStart = dayjs();
  for (const action of actions) {
    if (!action.enabled) {
      i += 1;
      continue;
    }

    const start = dayjs();
    const logs: Log[] = [];

    for (const cmd of action.commands.split("\n")) {
      const result = await spawn(
        ctx,
        `fluentci run ${action.useWasm ? "--wasm" : ""} ${action.plugin} ${cmd}`
      );

      logs.push(...result.logs);

      if (result.code !== 0) {
        await ctx.kv.runs.save(data.projectId, {
          ...data,
          jobs: data.jobs.map((job, j) => ({
            ...job,
            status: i === j ? "FAILED" : job.status,
            duration:
              i === j ? dayjs().diff(start, "milliseconds") : job.duration,
            logs: i === j ? [...(job.logs || []), ...result.logs] : job.logs,
          })),
          status: "FAILED",
        });
        return;
      }
    }

    await ctx.kv.runs.save(data.projectId, {
      ...data,
      jobs: data.jobs.map((job, j) => ({
        ...job,
        status: i === j ? "SUCCESS" : job.status,
        duration: i === j ? dayjs().diff(start, "milliseconds") : job.duration,
        logs: i === j ? [...(job.logs || []), ...logs] : job.logs,
      })),
      status: "SUCCESS",
    });

    i += 1;
  }

  const run = await ctx.kv.runs.get(data.id);

  await ctx.kv.runs.save(data.projectId, {
    ...run!,
    status: "SUCCESS",
    duration: dayjs().diff(runStart, "milliseconds"),
  });
}

async function spawn(ctx: Context, cmd: string) {
  const logs: Log[] = [];
  const child = new Deno.Command("bash", {
    args: ["-c", cmd],
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const writable = new WritableStream({
    write: (chunk) => {
      const text = new TextDecoder().decode(chunk);
      console.log(text);
      const log = new Log({
        id: createId(),
        message: text,
        createdAt: new Date().toISOString(),
      });
      logs.push(log);
      ctx.socket?.send(text);
    },
  });

  const { code } = await child.status;

  await child.stdout.pipeTo(writable);
  return { logs, code };
}
