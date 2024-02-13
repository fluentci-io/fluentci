import { SchemaBuilder } from "../../../deps.ts";
import { Job } from "./objects/job.ts";
import { Log } from "./objects/log.ts";
import { Project } from "./objects/project.ts";
import { getJobs, getJob } from "./resolvers/job/queries.ts";
import { getLog, getLogs } from "./resolvers/log/queries.ts";
import { getProject, getProjects } from "./resolvers/project/queries.ts";
import { runJob } from "./resolvers/job/mutations.ts";
import { createProject, runPipeline } from "./resolvers/project/mutations.ts";

const builder = new SchemaBuilder({});

builder.objectType(Job, {
  name: "Job",
  description: "A job is a task that is run in a project.",
  fields: (t) => ({
    id: t.exposeID("id"),
    projectId: t.exposeID("projectId"),
    name: t.exposeString("name"),
    status: t.exposeString("status"),
    createdAt: t.exposeString("createdAt"),
  }),
});

builder.objectType(Log, {
  name: "Log",
  description: "A log is a message that is created during a job.",
  fields: (t) => ({
    id: t.exposeID("id"),
    jobId: t.exposeID("jobId"),
    message: t.exposeString("message"),
    createdAt: t.exposeString("createdAt"),
  }),
});

builder.objectType(Project, {
  name: "Project",
  description: "A project is a collection of jobs.",
  fields: (t) => ({
    id: t.exposeID("id"),
    path: t.exposeString("path"),
    name: t.exposeString("name"),
    createdAt: t.exposeString("createdAt"),
  }),
});

builder.queryType({
  fields: (t) => ({
    projects: t.field({
      type: [Project],
      resolve: getProjects,
    }),
    project: t.field({
      type: Project,
      nullable: true,
      args: {
        id: t.arg.id(),
      },
      resolve: getProject,
    }),
    jobs: t.field({
      type: [Job],
      resolve: getJobs,
    }),
    job: t.field({
      type: Job,
      nullable: true,
      args: {
        id: t.arg.id(),
      },
      resolve: getJob,
    }),
    log: t.field({
      type: Log,
      nullable: true,
      resolve: getLog,
    }),
    logs: t.field({
      type: [Log],
      resolve: getLogs,
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    createProject: t.field({
      type: Project,
      resolve: createProject,
    }),
    runPipeline: t.field({
      type: Project,
      args: {
        projectId: t.arg.id(),
      },
      resolve: runPipeline,
    }),
    runJob: t.field({
      type: Job,
      args: {
        projectId: t.arg.id(),
        jobName: t.arg.string(),
      },
      resolve: runJob,
    }),
  }),
});

export const schema = builder.toSchema();
