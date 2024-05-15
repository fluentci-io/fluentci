// deno-lint-ignore-file no-unused-vars no-explicit-any
import { Context } from "../../context.ts";
import { Project } from "../../objects/project.ts";
import { _ } from "../../../../../deps.ts";

export async function getProjects(
  root: any,
  args: any,
  ctx: Context
): Promise<Project[]> {
  if (args.skip && args.limit) {
    const { cursor } = await ctx.kv.projects.list({
      limit: args.skip,
      reverse: true,
    });
    const results = await ctx.kv.projects.list({
      limit: args.limit,
      cursor,
      reverse: _.get(args, "reverse", true),
    });

    return results.projects.map((x) => ({ ...x, cursor: results.cursor }));
  }

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

export function countProjects(
  root: any,
  args: any,
  ctx: Context
): Promise<number> {
  return ctx.kv.projects.count();
}
