import { Context } from "../../context.ts";
import { Run } from "../../objects/run.ts";
import run from "../../../executor.ts";
import { createId } from "../../../../../deps.ts";
import { GraphQLError } from "npm:graphql@16.8.1";

export async function runPipeline(
  root: any,
  args: any,
  ctx: Context
): Promise<Run> {
  const data = new Run({
    id: createId(),
    name: "",
    title: "",
    duration: 0,
    date: new Date().toISOString(),
    jobs: [],
  });
  const project = await ctx.kv.projects.get(args.projectId);

  if (!project) {
    throw new GraphQLError(`no projects found with id ${args.projectId}`);
  }

  const actions = ctx.kv.actions.get(args.projectId);

  await ctx.kv.runs.save(args.projectId, data);
  run(ctx, []);

  return data;
}
