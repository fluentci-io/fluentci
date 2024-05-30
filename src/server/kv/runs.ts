import { dayjs, _ } from "../../../deps.ts";
import { FLUENTCI_KV_PREFIX } from "../../consts.ts";
import { Run } from "../graphql/objects/run.ts";
import kv, { Pagination } from "../kv.ts";
import * as logs from "./logs.ts";

export async function save(project: string, data: Run) {
  for (const job of data.jobs) {
    for (const log of job.logs || []) logs.save(project, log);
    delete job.logs;
  }

  const run = await get(data.id);

  await kv.delete([
    FLUENTCI_KV_PREFIX,
    "runs_by_date",
    project,
    dayjs(_.get(run, "date", data.date)).unix(),
  ]);

  await kv
    .atomic()
    .set([FLUENTCI_KV_PREFIX, "runs", project, data.id], data)
    .set([FLUENTCI_KV_PREFIX, "runs", data.id], data)
    .set(
      [
        FLUENTCI_KV_PREFIX,
        "runs_by_week",
        project,
        dayjs().startOf("week").add(1, "day").unix(),
        data.id,
      ],
      data
    )
    .set(
      [
        FLUENTCI_KV_PREFIX,
        "runs_by_date",
        project,
        dayjs(_.get(run, "date", data.date)).unix(),
      ],
      data
    )
    .commit();
}

export async function get(id: string) {
  const { value } = await kv.get<Run>([FLUENTCI_KV_PREFIX, "runs", id]);
  if (value) {
    for (const job of value.jobs) {
      job.logs = await logs.get(value.projectId, job.id);
    }
  }
  return value;
}

export async function list(
  project: string,
  { limit, cursor, reverse }: Pagination = {
    limit: 100,
    reverse: true,
  }
) {
  const iter = kv.list<Run>(
    {
      prefix: [FLUENTCI_KV_PREFIX, "runs_by_date", project],
    },
    {
      limit,
      cursor,
      reverse,
    }
  );
  const runs = [];
  for await (const run of iter) {
    for (const job of run.value.jobs) {
      job.logs = await logs.get(project, job.id);
    }
    runs.push(run.value);
  }
  return {
    runs,
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
