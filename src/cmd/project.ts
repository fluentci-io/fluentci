import * as projects from "../server/kv/projects.ts";
import * as actions from "../server/kv/actions.ts";
import {
  Table,
  _,
  createId,
  cyan,
  dockernames,
  dayjs,
  magenta,
} from "../../deps.ts";
import icons from "../server/icons.ts";
import generate from "../exporter/generate.ts";
import { bash, setupPkgx } from "../utils.ts";

export async function create() {
  const projectId = createId();
  let name = dockernames.getRandomName().replaceAll("_", "-");
  let suffix = 1;

  const project = await projects.at("empty");

  if (project) {
    return project;
  }

  do {
    const project = await projects.byName(name);
    if (!project) {
      break;
    }
    name = `${name}-${suffix}`;
    suffix++;
  } while (true);

  const icon = _.sample(icons);
  await projects.save({
    id: projectId,
    path: "empty",
    name,
    createdAt: new Date().toISOString(),
    picture: `https://img.icons8.com/color-glass/96/${icon}.png`,
  });

  console.log(
    `Project created, run ${cyan(
      `FLUENTCI_PROJECT_ID=${name} fluentci run .`
    )} to finish setup`
  );
}

export async function list() {
  const results = await projects.list();

  if (results.projects.length === 0) {
    console.log(
      `No projects yet, run ${cyan("fluentci project create")} to create one`
    );
    return;
  }

  const table = new Table();
  table.header(["NAME", "PATH", "CREATED", "STATUS"]);

  table.push(
    ...results.projects.map((x) => [
      x.name,
      x.path,
      dayjs(x.createdAt).fromNow(),
      _.get(_.first(_.get(x, "recentRuns", [])), "status", ""),
    ])
  );

  table.render();
}

export async function show(name: string) {
  const project = await projects.byName(name);
  if (!project) {
    console.error(`Project '${name}' not found`);
    Deno.exit(1);
  }
  console.log(`${magenta("id:")} ${project.id}`);
  console.log(`${magenta("path:")} ${project.path}`);
  console.log(`${magenta("name:")} ${project.name}`);
  console.log(`${magenta("created:")} ${dayjs(project.createdAt).fromNow()}`);
  console.log(`${magenta("speed:")} ${project.speed} ms`);
  console.log(`${magenta("reliability:")} ${project.reliability}%`);
  console.log(`${magenta("builds per week:")} ${project.buildsPerWeek}`);
}

export async function exportActions(
  options: {
    github?: boolean;
    azure?: boolean;
    gitlab?: boolean;
    circleci?: boolean;
    aws?: boolean;
  },
  project?: string
) {
  let result = await projects.at(Deno.cwd());
  if (!result && !project) {
    console.error("No FluentCI project found in current directory");
    Deno.exit(1);
  }

  if (project) {
    result = await projects.byName(project);
    if (!result) {
      console.error(`Project '${project}' not found`);
      Deno.exit(1);
    }
  }

  const _actions = await actions.get(result?.id || "");

  await setupPkgx();

  if (options.github) {
    const yaml = await generate("github", _actions || []);
    await bash`echo '${yaml}' | pkgx yq`;
    return;
  }

  if (options.azure) {
    const yaml = await generate("azure", _actions || []);
    await bash`echo '${yaml}' | pkgx yq`;
    return;
  }

  if (options.gitlab) {
    const yaml = await generate("gitlab", _actions || []);
    await bash`echo '${yaml}' | pkgx yq`;
    return;
  }

  if (options.circleci) {
    const yaml = await generate("circleci", _actions || []);
    await bash`echo '${yaml}' | pkgx yq`;
    return;
  }

  if (options.aws) {
    const yaml = await generate("aws", _actions || []);
    await bash`echo '${yaml}' | pkgx yq`;
    return;
  }

  const yaml = await generate("github", _actions || []);
  await bash`echo '${yaml}' | pkgx yq`;
  return;
}
