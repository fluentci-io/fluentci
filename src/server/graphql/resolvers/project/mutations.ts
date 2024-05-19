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
