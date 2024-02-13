import { Context } from "../../context.ts";
import { Log } from "../../objects/log.ts";

export async function getLogs(
  root: any,
  args: any,
  ctx: Context
): Promise<Log[]> {
  return [
    new Log({
      id: "1",
      jobId: "1",
      message: "message",
      createdAt: new Date().toISOString(),
    }),
  ];
}

export async function getLog(root: any, args: any, ctx: Context): Promise<Log> {
  return new Log({
    id: "1",
    jobId: "1",
    message: "message",
    createdAt: new Date().toISOString(),
  });
}
