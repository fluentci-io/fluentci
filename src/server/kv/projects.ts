import { FLUENTCI_KV_PREFIX } from "../../consts.ts";
import { Project } from "../graphql/objects/project.ts";
import kv, { Pagination } from "../kv.ts";
import { dayjs } from "../../../deps.ts";
import { Run } from "../graphql/objects/run.ts";

export async function save(data: Project) {
  await kv
    .atomic()
    .set([FLUENTCI_KV_PREFIX, "projects", data.id], data)
    .set([FLUENTCI_KV_PREFIX, "path", data.path || "empty"], data)
    .set([FLUENTCI_KV_PREFIX, "projects_by_name", data.name], data)
    .set(
      [FLUENTCI_KV_PREFIX, "projects_by_date", dayjs(data.createdAt).unix()],
      data
    )
    .commit();
}

export async function updateStats(id: string) {
  const project = await get(id);
  if (!project) return;
  const iter = await kv.list<Run>(
    {
      prefix: [FLUENTCI_KV_PREFIX, "runs_by_date", id],
    },
    {
      limit: 18,
      reverse: true,
    }
  );
  const recentRuns = [];
  for await (const run of iter) recentRuns.push(run.value);
  recentRuns.reverse();
  const speed =
    recentRuns.reduce((acc, run) => acc + (run.duration || 0), 0) /
    recentRuns.length;
  const reliability =
    (recentRuns.filter((run) => run.status === "SUCCESS").length /
      recentRuns.length) *
    100;

  const buildsByWeekIter = await kv.list<Run>({
    prefix: [
      FLUENTCI_KV_PREFIX,
      "runs_by_week",
      id,
      dayjs().startOf("week").add(1, "day").unix(),
    ],
  });
  let buildsPerWeek = 0;
  for await (const _ of buildsByWeekIter) buildsPerWeek++;

  await save({
    ...project,
    speed,
    reliability,
    buildsPerWeek,
    recentRuns,
  });
}

export async function get(id: string) {
  const { value } = await kv.get<Project>([FLUENTCI_KV_PREFIX, "projects", id]);
  return value;
}

export async function at(path: string) {
  const { value } = await kv.get<Project>([FLUENTCI_KV_PREFIX, "path", path]);
  return value;
}

export async function byName(name: string) {
  const { value } = await kv.get<Project>([
    FLUENTCI_KV_PREFIX,
    "by_name",
    name,
  ]);
  return value;
}

export async function list(
  { limit, cursor, reverse }: Pagination = {
    limit: 100,
  }
) {
  const iter = kv.list<Project>(
    {
      prefix: [FLUENTCI_KV_PREFIX, "projects_by_date"],
    },
    {
      limit,
      cursor,
      reverse,
    }
  );
  const projects = [];
  for await (const project of iter) projects.push(project.value);
  return { projects, cursor: iter.cursor };
}

export async function listByName(
  { limit, cursor, reverse }: Pagination = {
    limit: 100,
  }
) {
  const iter = kv.list<Project>(
    {
      prefix: [FLUENTCI_KV_PREFIX, "projects_by_name"],
    },
    {
      limit,
      cursor,
      reverse,
    }
  );
  const projects = [];
  for await (const project of iter) projects.push(project.value);
  return { projects, cursor: iter.cursor };
}

export async function count() {
  const iter = kv.list<Project>({
    prefix: [FLUENTCI_KV_PREFIX, "projects"],
  });
  let n = 0;
  for await (const _ of iter) n++;
  return n;
}
