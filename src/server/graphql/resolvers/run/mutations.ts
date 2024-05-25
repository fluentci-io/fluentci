// deno-lint-ignore-file no-explicit-any
import { Context } from "../../context.ts";
import { Run } from "../../objects/run.ts";
import { GraphQLError } from "npm:graphql@16.8.1";
import run from "../../../../shared/run.ts";

export async function runPipeline(
  _root: any,
  args: any,
  ctx: Context
): Promise<Run> {
  const project = await ctx.kv.projects.get(args.projectId);
  if (!project) {
    throw new GraphQLError(`no projects found with id ${args.projectId}`);
  }
  return run(ctx, project, args.wait);
}
