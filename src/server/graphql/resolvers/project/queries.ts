import { Context } from "../../context.ts";
import { Log } from "../../objects/log.ts";
import { Project } from "../../objects/project.ts";
import { logs } from "../log/mock.ts";

export async function getProjects(
  root: any,
  args: any,
  ctx: Context
): Promise<Project[]> {
  return [
    new Project({
      id: "1",
      path: "/home/tsirysndr/Documents/github/gleam",
      name: "gleam",
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

export async function getProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project> {
  return new Project({
    id: "1",
    path: "/home/tsirysndr/Documents/github/fluentci",
    name: "fluentci",
    createdAt: new Date().toISOString(),
    logs: new Log({
      id: "1",
      jobId: "3",
      message: logs,
      createdAt: new Date().toISOString(),
    }),
  });
}
