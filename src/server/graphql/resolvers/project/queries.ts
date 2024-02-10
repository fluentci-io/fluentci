import { Context } from "../../context.ts";
import { Project } from "../../objects/project.ts";

export async function getProjects(
  root: any,
  args: any,
  ctx: Context
): Promise<Project[]> {
  return [
    new Project({
      id: "1",
      path: "path",
      name: "name",
      createdAt: new Date().toISOString(),
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
    path: "path",
    name: "name",
    createdAt: new Date().toISOString(),
  });
}
