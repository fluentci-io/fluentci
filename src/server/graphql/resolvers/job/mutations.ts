import { Context } from "../../context.ts";
import { Job } from "../../objects/job.ts";

export async function runJob(root: any, args: any, ctx: Context): Promise<Job> {
  return new Job({
    id: "1",
    projectId: "1",
    status: "running",
    name: "deploy",
    createdAt: new Date().toISOString(),
  });
}
