// deno-lint-ignore-file no-unused-vars no-explicit-any
import { _ } from "../../../../../deps.ts";
import { Context } from "../../context.ts";
import { Run } from "../../objects/run.ts";

export async function getRuns(
  root: any,
  args: any,
  ctx: Context
): Promise<Run[]> {
  if (args.skip && args.limit) {
    const { cursor } = await ctx.kv.runs.list(args.projectId, {
      limit: args.skip,
      reverse: true,
    });
    const results = await ctx.kv.runs.list(args.projectId, {
      limit: args.limit,
      cursor,
      reverse: _.get(args, "reverse", true),
    });

    return results.runs.map((x) => ({ ...x, cursor: results.cursor }));
  }

  const { runs: results, cursor } = await ctx.kv.runs.list(args.projectId, {
    limit: _.get(args, "limit", 100),
    cursor: args.cursor,
    reverse: _.get(args, "reverse", true),
  });
  return results.map((x) => ({ ...x, cursor }));
}

export function getRun(
  root: any,
  args: any,
  ctx: Context
): Promise<Run | null> {
  return ctx.kv.runs.get(args.id);
}

export function countRuns(root: any, args: any, ctx: Context): Promise<number> {
  return ctx.kv.runs.count(args.projectId);
}
