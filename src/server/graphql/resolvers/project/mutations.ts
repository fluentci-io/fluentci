import { Context } from "../../context.ts";
import { Project } from "../../objects/project.ts";

export async function createProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project> {
  return new Project({
    id: "1",
    path: "/home/tsirysndr/Documents/github/fluentci",
    name: "fluentci",
    createdAt: new Date().toISOString(),
  });
}

export async function runPipeline(
  root: any,
  args: any,
  ctx: Context
): Promise<Project> {
  return new Project({
    id: "1",
    path: "/home/tsirysndr/Documents/github/gleam_pipeline/example",
    name: "gleam_example",
    createdAt: new Date().toISOString(),
  });
}
