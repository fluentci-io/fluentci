// deno-lint-ignore-file no-unused-vars no-explicit-any
import { Context } from "../../context.ts";
import { Action } from "../../objects/action.ts";

export function getActions(
  root: any,
  args: any,
  ctx: Context
): Promise<Action[]> {
  return ctx.kv.actions.get(args.projectId);
}
