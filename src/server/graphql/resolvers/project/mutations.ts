// deno-lint-ignore-file no-unused-vars no-explicit-any
import { createId, dockernames, _ } from "../../../../../deps.ts";
import { cloneRepository } from "../../../../git.ts";
import { parseConfig } from "../../../../parser/config.ts";
import run from "../../../../shared/run.ts";
import { Actions } from "../../../../types.ts";
import { directoryExists, fileExists } from "../../../../utils.ts";
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

  do {
    const project = await ctx.kv.projects.byName(name);
    if (!project) {
      break;
    }
    name = `${name}-${suffix}`;
    suffix++;
  } while (true);

  const project = await ctx.kv.projects.at("empty");
  const icon = _.sample(icons);
  let actions: Actions = [];

  if (args.fromRepository) {
    const cacheDir = `${Deno.env.get(
      "HOME"
    )}/.fluentci/cache/${args.fromRepository
      .replace("https://", "")
      .replace("http://", "")
      .replace(".git", "")
      .split("/")
      .slice(0, -1)
      .join("/")}`;
    await Deno.mkdir(cacheDir, { recursive: true });
    const repoPath = `${cacheDir}/${args.fromRepository
      .split("/")
      .pop()
      .replace(".git", "")}`;
    if (!(await directoryExists(repoPath))) {
      await cloneRepository(args.fromRepository, cacheDir);
    }

    if (await fileExists(`${repoPath}/.fluentci/fluentci.toml`)) {
      const content = await Deno.readTextFile(
        `${repoPath}/.fluentci/fluentci.toml`
      );
      actions = parseConfig(content);
    }

    await new Deno.Command("cp", {
      args: [
        "-r",
        repoPath,
        `${Deno.env.get("HOME")}/.fluentci/workspace/${
          project ? project.name : name
        }`,
      ],
    }).spawn().status;
  }

  if (project) {
    if (args.fromRepository) {
      await ctx.kv.projects.save({
        ...project,
        path: `${Deno.env.get("HOME")}/.fluentci/workspace/${project.name}`,
      });
      await ctx.kv.projects.remove(project.path);

      await ctx.kv.actions.save(
        project.id,
        actions.map((action) => ({
          commands: action.commands,
          enabled: action.enabled,
          githubUrl: action.github_url,
          logo: action.logo,
          name: action.name,
          plugin: action.plugin,
          useWasm: action.use_wasm,
          env: action.env
            ? Object.entries(action.env).map(
                ([key, value]) => `${key}=${value}`
              )
            : [],
          workingDirectory: action.working_directory,
        }))
      );

      run(
        ctx,
        {
          ...project,
          path: `${Deno.env.get("HOME")}/.fluentci/workspace/${project.name}`,
        },
        true
      );
    }
    return project;
  }

  if (args.fromRepository) {
    await ctx.kv.actions.save(
      projectId,
      actions.map((action) => ({
        commands: action.commands,
        enabled: action.enabled,
        githubUrl: action.github_url,
        logo: action.logo,
        name: action.name,
        plugin: action.plugin,
        useWasm: action.use_wasm,
        env: action.env
          ? Object.entries(action.env).map(([key, value]) => `${key}=${value}`)
          : [],
        workingDirectory: action.working_directory,
      }))
    );
  }

  await ctx.kv.projects.save({
    id: projectId,
    path: args.fromRepository
      ? `${Deno.env.get("HOME")}/.fluentci/workspace/${name}`
      : "empty",
    name,
    createdAt: new Date().toISOString(),
    picture: `https://img.icons8.com/color-glass/96/${icon}.png`,
  });

  if (args.fromRepository) {
    run(ctx, (await ctx.kv.projects.get(projectId))!, true);
  }

  return new Project({
    id: projectId,
    path: args.fromRepository
      ? `${Deno.env.get("HOME")}/.fluentci/workspace/${name}`
      : Deno.cwd(),
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
