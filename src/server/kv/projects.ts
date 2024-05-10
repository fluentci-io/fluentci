import { FLUENTCI_KV_PREFIX } from "../../consts.ts";
import { Project } from "../graphql/objects/project.ts";
import kv, { Pagination } from "../kv.ts";

export async function save(data: Project) {
  await kv.set([FLUENTCI_KV_PREFIX, "projects", data.id], data);
  await kv.set([FLUENTCI_KV_PREFIX, "path", data.path], data);
  await kv.set([FLUENTCI_KV_PREFIX, "by_name", data.name], data);
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
  { limit, cursor }: Pagination = {
    limit: 100,
  }
) {
  const iter = kv.list<Project>(
    {
      prefix: [FLUENTCI_KV_PREFIX, "projects"],
    },
    {
      limit,
      cursor,
    }
  );
  const projects = [];
  for await (const project of iter) projects.push(project.value);
  return { projects, cursor: iter.cursor };
}
