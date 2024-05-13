import { Context } from "../../context.ts";
import { Run } from "../../objects/run.ts";
import run from "../../../executor.ts";
import { createId } from "../../../../../deps.ts";
import { GraphQLError } from "npm:graphql@16.8.1";
import { getCommitInfos } from "../../../../git.ts";

export async function runPipeline(
  root: any,
  args: any,
  ctx: Context
): Promise<Run> {
  const project = await ctx.kv.projects.get(args.projectId);
  if (!project) {
    throw new GraphQLError(`no projects found with id ${args.projectId}`);
  }

  const count = await ctx.kv.runs.count(args.projectId);

  const { commit, sha, author, branch } = await getCommitInfos(project.path);
  const actions = await ctx.kv.actions.get(args.projectId);

  const data = new Run({
    id: createId(),
    name: `Run #${count + 1}`,
    project: project.name,
    projectId: project.id,
    title: commit,
    commit: sha,
    author,
    branch,
    duration: 0,
    date: new Date().toISOString(),
    jobs: actions.map((x) => ({
      id: createId(),
      projectId: project.id,
      name: x.name,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    })),
    status: "RUNNING",
  });

  await ctx.kv.runs.save(args.projectId, data);
  run(ctx, actions, data);

  return data;
}
