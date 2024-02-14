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
      projectId: "stupefied_kalam",
      status: "running",
      name: "build",
      createdAt: new Date().toISOString(),
      logs: new Log({
        id: "1",
        jobId: "2",
        message: logs,
        createdAt: new Date().toISOString(),
      }),
    }),
    new Job({
      id: "2",
      projectId: "stupefied_kalam",
      status: "pending",
      name: "test",
      createdAt: new Date().toISOString(),
    }),
    new Job({
      id: "3",
      projectId: "stupefied_kalam",
      status: "pending",
      name: "deploy",
      createdAt: new Date().toISOString(),
      logs: new Log({
        id: "1",
        jobId: "3",
        message: logs,
        createdAt: new Date().toISOString(),
      }),
    }),
  ];
}

export async function getJob(root: any, args: any, ctx: Context): Promise<Job> {
  return new Job({
    id: "1",
    projectId: "stupefied_kalam",
    status: "running",
    name: "build",
    createdAt: new Date().toISOString(),
    logs: new Log({
      id: "1",
      jobId: "3",
      message: logs,
      createdAt: new Date().toISOString(),
    }),
  });
}
