import { dayjs } from "../../../deps.ts";
import { FLUENTCI_KV_PREFIX } from "../../consts.ts";
import { Run } from "../graphql/objects/run.ts";
import kv, { Pagination } from "../kv.ts";

export async function save(project: string, data: Run) {
  await kv.set([FLUENTCI_KV_PREFIX, "runs", project, data.id], data);
  await kv.set([FLUENTCI_KV_PREFIX, "runs", data.id], data);
}

export async function get(id: string) {
  const { value } = await kv.get<Run>([FLUENTCI_KV_PREFIX, "runs", id]);
  return value;
}

export async function list(
  project: string,
  { limit, cursor }: Pagination = {
    limit: 100,
  }
) {
  const iter = kv.list<Run>(
    {
      prefix: [FLUENTCI_KV_PREFIX, "runs", project],
    },
    {
      limit,
      cursor,
    }
  );
  const runs = [];
  for await (const run of iter) runs.push(run.value);
  return {
    runs: runs.sort((x, y) => dayjs(y.date).unix() - dayjs(x.date).unix()),
    cursor: iter.cursor,
  };
}

export async function count(project: string) {
  const iter = kv.list<Run>({
    prefix: [FLUENTCI_KV_PREFIX, "runs", project],
  });
  let n = 0;
  for await (const _ of iter) n++;
  return n;
}
