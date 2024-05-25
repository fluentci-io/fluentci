import { createId } from "../../deps.ts";
import { getCommitInfos } from "../git.ts";
import run from "../server/executor.ts";
import { Context } from "../server/graphql/context.ts";
import { Project } from "../server/graphql/objects/project.ts";
import { Run } from "../server/graphql/objects/run.ts";

export default async function (ctx: Context, project: Project, wait = false) {
  const count = await ctx.kv.runs.count(project.id);

  const { commit, sha, author, branch } = await getCommitInfos(project.path);
  const actions = (await ctx.kv.actions.get(project.id)) || [];

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

  await ctx.kv.runs.save(project.id, data);
  if (wait) {
    await run(ctx, actions, data);
    return data;
  }
  run(ctx, actions, data);
  return data;
}
