// deno-lint-ignore-file no-unused-vars no-explicit-any
import generate from "../../../../exporter/generate.ts";
import { Context } from "../../context.ts";
import { Action } from "../../objects/action.ts";

export function getActions(
  root: any,
  args: any,
  ctx: Context
): Promise<Action[] | null> {
  return ctx.kv.actions.get(args.projectId);
}

export async function exportActions(
  root: any,
  args: any,
  ctx: Context
): Promise<string> {
  const actions = await ctx.kv.actions.get(args.projectId);
  return generate(args.plateform, actions || []);
}
