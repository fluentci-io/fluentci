import { dayjs } from "../../../deps.ts";
import { FLUENTCI_KV_PREFIX } from "../../consts.ts";
import { Log } from "../graphql/objects/log.ts";
import kv from "../kv.ts";

export async function save(project: string, data: Log) {
  await kv.set(
    [
      FLUENTCI_KV_PREFIX,
      "logs",
      project,
      data.jobId,
      dayjs(data.createdAt).valueOf(),
    ],
    data
  );
}

export async function get(project: string, jobId: string) {
  const iter = await kv.list<Log>({
    prefix: [FLUENTCI_KV_PREFIX, "logs", project, jobId],
  });
  const logs = [];
  for await (const log of iter) {
    logs.push(log.value);
  }
  return logs;
}

export async function count(project: string, jobId: string) {
  const iter = kv.list<Log>({
    prefix: [FLUENTCI_KV_PREFIX, "logs", project, jobId],
  });
  let n = 0;
  for await (const _ of iter) n++;
  return n;
}
