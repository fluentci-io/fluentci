// deno-lint-ignore-file no-unused-vars no-explicit-any
import { createId, dockernames, _ } from "../../../../../deps.ts";
import icons from "../../../icons.ts";
import { Context } from "../../context.ts";
import { Project } from "../../objects/project.ts";

export async function createProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project> {
  const projectId = createId();
  let name = dockernames.getRandomName().replaceAll("_", "-");
  let suffix = 1;

  const project = await ctx.kv.projects.at("empty");

  if (project) {
    return project;
  }

  do {
    const project = await ctx.kv.projects.byName(name);
    if (!project) {
      break;
    }
    name = `${name}-${suffix}`;
    suffix++;
  } while (true);

  const icon = _.sample(icons);
  await ctx.kv.projects.save({
    id: projectId,
    path: "empty",
    name,
    createdAt: new Date().toISOString(),
    picture: `https://img.icons8.com/color-glass/96/${icon}.png`,
  });
  return new Project({
    id: projectId,
    path: Deno.cwd(),
    name,
    createdAt: new Date().toISOString(),
    picture: `https://img.icons8.com/color-glass/96/${icon}.png`,
  });
}

export async function updateProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project | null> {
  const project = await ctx.kv.projects.get(args.id);

  if (!project) {
    return null;
  }

  const tags = _.get(args, "tags", "")
    .split(",")
    .map((x: string) => x.trim());

  await ctx.kv.projects.save({
    ...project,
    displayName: args.name,
    description: args.description,
    tags,
  });

  return ctx.kv.projects.get(args.id);
}

export async function deleteProject(
  root: any,
  args: any,
  ctx: Context
): Promise<boolean> {
  const project = await ctx.kv.projects.get(args.id);

  if (!project) {
    return false;
  }

  await ctx.kv.projects.remove(args.id);

  return true;
}

export async function archiveProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project | null> {
  const project = await ctx.kv.projects.get(args.id);

  if (!project) {
    return null;
  }

  await ctx.kv.projects.save({
    ...project,
    archived: true,
  });

  return ctx.kv.projects.get(args.id);
}

export async function unarchiveProject(
  root: any,
  args: any,
  ctx: Context
): Promise<Project | null> {
  const project = await ctx.kv.projects.get(args.id);

  if (!project) {
    return null;
  }

  await ctx.kv.projects.save({
    ...project,
    archived: false,
  });

  return ctx.kv.projects.get(args.id);
}
