import { FLUENTCI_KV_PREFIX } from "../../consts.ts";
import { Action } from "../graphql/objects/action.ts";
import kv from "../kv.ts";

export async function save(project: string, data: Action[]): Promise<void> {
  await kv.set([FLUENTCI_KV_PREFIX, "actions", project], data);
}

export async function get(project: string): Promise<Action[] | null> {
  const { value } = await kv.get<Action[]>([
    FLUENTCI_KV_PREFIX,
    "actions",
    project,
  ]);
  return value;
}
