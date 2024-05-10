// deno-lint-ignore-file no-unused-vars no-explicit-any
import { Context } from "../../context.ts";
import { Project } from "../../objects/project.ts";

export async function getProjects(
  root: any,
  args: any,
  ctx: Context
): Promise<Project[]> {
  const { projects, cursor } = await ctx.kv.projects.list({
    limit: args.limit,
    cursor: args.cursor,
  });
  return projects.map((x) => ({ ...x, cursor }));
}

export async function getProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project | null> {
  const project = await ctx.kv.projects.get(args.id);
  return project;
}
