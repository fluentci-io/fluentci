// deno-lint-ignore-file no-explicit-any
import { Context } from "../../context.ts";
import { Action } from "../../objects/action.ts";

export async function saveActions(
  _root: any,
  args: { projectId: string | number; actions: Action[] },
  ctx: Context
): Promise<Action[]> {
  await ctx.kv.actions.save(args.projectId.toString(), args.actions);
  return ctx.kv.actions.get(args.projectId.toString());
}
