// deno-lint-ignore-file no-unused-vars no-explicit-any
import { Context } from "../../context.ts";
import { Run } from "../../objects/run.ts";

export async function getRuns(
  root: any,
  args: any,
  ctx: Context
): Promise<Run[]> {
  const { runs: results, cursor } = await ctx.kv.runs.list(args.projectId, {
    limit: args.limit,
    cursor: args.cursor,
  });
  return results.map((x) => ({ ...x, cursor }));
}

export function getRun(
  root: any,
  args: any,
  ctx: Context
): Promise<Run | null> {
  return ctx.kv.runs.get(args.projectId, args.id);
}
