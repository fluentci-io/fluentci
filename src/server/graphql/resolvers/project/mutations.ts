// deno-lint-ignore-file no-unused-vars no-explicit-any
import { Context } from "../../context.ts";
import { Project } from "../../objects/project.ts";

export async function createProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project> {
  // ctx.kv.projects.save()
  return new Project({
    id: "1",
    path: "/home/tsirysndr/Documents/github/fluentci",
    name: "fluentci",
    createdAt: new Date().toISOString(),
  });
}
