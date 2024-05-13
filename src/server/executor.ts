import { Context } from "./graphql/context.ts";
import { Action } from "./graphql/objects/action.ts";
import { Run } from "./graphql/objects/run.ts";
import { createId, dayjs } from "../../deps.ts";
import { Log } from "./graphql/objects/log.ts";
import { sendSocketMessage } from "../utils.ts";

export default async function run(ctx: Context, actions: Action[], data: Run) {
  let currentActionIndex = 0;
  const runStart = dayjs();
  let jobs = [...data.jobs];

  ctx.sockets.forEach((s) =>
    sendSocketMessage(
      s,
      JSON.stringify({
        channel: "run",
        data: {
          ...data,
          status: "RUNNING",
          date: new Date().toISOString(),
        },
      })
    )
  );

  ctx.kv.runs.save(data.projectId, {
    ...data,
    date: new Date().toISOString(),
  });

  for (const action of actions) {
    if (!action.enabled) {
      currentActionIndex += 1;
      continue;
    }

    const start = dayjs();
    const logs: Log[] = [];

    jobs = jobs.map((job, j) => ({
      ...job,
      startedAt: currentActionIndex === j ? start.toISOString() : job.startedAt,
      status: currentActionIndex === j ? "RUNNING" : job.status,
    }));

    ctx.sockets.forEach((s) =>
      sendSocketMessage(
        s,
        JSON.stringify({
          channel: "job",
          data: {
            ...jobs[currentActionIndex],
            startedAt: start.toISOString(),
            status: "RUNNING",
          },
        })
      )
    );

    await ctx.kv.runs.save(data.projectId, {
      ...data,
      jobs,
    });

    for (const cmd of action.commands.split("\n")) {
      const result = await spawn(
        ctx,
        `fluentci run ${action.useWasm ? "--wasm" : ""} ${
          action.plugin
        } ${cmd}`,
        jobs[currentActionIndex].id
      );

      logs.push(...result.logs);

      if (result.code !== 0) {
        ctx.sockets.forEach((s) =>
          sendSocketMessage(
            s,
            JSON.stringify({
              channel: "job",
              data: {
                ...jobs[currentActionIndex],
                status: "FAILED",
                duration: dayjs().diff(start, "milliseconds"),
                logs: [...(jobs[currentActionIndex].logs || []), ...logs],
              },
            })
          )
        );

        jobs = jobs.map((job, j) => ({
          ...job,
          status: currentActionIndex === j ? "FAILED" : job.status,
          duration:
            currentActionIndex === j
              ? dayjs().diff(start, "milliseconds")
              : job.duration,
          logs:
            currentActionIndex === j
              ? [...(job.logs || []), ...result.logs]
              : job.logs,
        }));
        await ctx.kv.runs.save(data.projectId, {
          ...data,
          jobs,
          status: "FAILED",
        });
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

    await ctx.kv.runs.save(data.projectId, {
      ...data,
      jobs,
      status: "SUCCESS",
    });

    currentActionIndex += 1;
  }

  const run = await ctx.kv.runs.get(data.id);
  const duration = dayjs().diff(runStart, "milliseconds");
  await ctx.kv.runs.save(data.projectId, {
    ...run!,
    status: "SUCCESS",
    duration,
  });

  ctx.sockets.map((s) =>
    sendSocketMessage(
      s,
      JSON.stringify({
        channel: "run",
        data: {
          ...run!,
          status: "SUCCESS",
          duration,
        },
      })
    )
  );
}

async function spawn(ctx: Context, cmd: string, jobId?: string) {
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
      ctx.sockets.forEach((s) =>
        sendSocketMessage(
          s,
          JSON.stringify({ channel: "logs", data: { text, jobId } })
        )
      );
    },
  });

  const [_, { code }] = await Promise.all([
    child.stdout.pipeTo(writable),
    child.status,
  ]);

  return { logs, code };
}
