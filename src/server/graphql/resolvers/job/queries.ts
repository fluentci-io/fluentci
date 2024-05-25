// deno-lint-ignore-file require-await no-unused-vars no-explicit-any
import { Context } from "../../context.ts";
import { Job } from "../../objects/job.ts";
import { Log } from "../../objects/log.ts";
import { logs } from "../log/mock.ts";

export async function getJobs(
  root: any,
  args: any,
  ctx: Context
): Promise<Job[]> {
  return [
    new Job({
      id: "1",
      status: "RUNNING",
      name: "build",
      createdAt: new Date().toISOString(),
      logs: [],
    }),
    new Job({
      id: "2",
      status: "PENDING",
      name: "test",
      createdAt: new Date().toISOString(),
    }),
    new Job({
      id: "3",
      status: "PENDING",
      name: "deploy",
      createdAt: new Date().toISOString(),
    }),
  ];
}

export async function getJob(root: any, args: any, ctx: Context): Promise<Job> {
  return new Job({
    id: "1",
    status: "RUNNING",
    name: "build",
    createdAt: new Date().toISOString(),
  });
}
