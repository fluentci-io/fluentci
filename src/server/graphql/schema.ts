import { SchemaBuilder } from "../../../deps.ts";
import { Job } from "./objects/job.ts";
import { Log } from "./objects/log.ts";
import { Project } from "./objects/project.ts";
import { getJobs, getJob } from "./resolvers/job/queries.ts";
import { getLog, getLogs } from "./resolvers/log/queries.ts";
import {
  countProjects,
  getProject,
  getProjects,
} from "./resolvers/project/queries.ts";
import { runJob } from "./resolvers/job/mutations.ts";
import { createProject } from "./resolvers/project/mutations.ts";
import { runPipeline } from "./resolvers/run/mutations.ts";
import { countRuns, getRun, getRuns } from "./resolvers/run/queries.ts";
import { Run } from "./objects/run.ts";
import { Action } from "./objects/action.ts";
import { getActions } from "./resolvers/action/queries.ts";
import { saveActions } from "./resolvers/action/mutations.ts";
import { Context } from "./context.ts";

const builder = new SchemaBuilder<{ Context: Context }>({});

builder.objectType(Job, {
  name: "Job",
  description: "A job is a task that is run in a project.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    status: t.exposeString("status"),
    createdAt: t.exposeString("createdAt"),
    startedAt: t.exposeString("startedAt", { nullable: true }),
    duration: t.exposeInt("duration", { nullable: true }),
    logs: t.field({
      type: [Log],
      nullable: true,
      resolve: (root) => root.logs,
    }),
  }),
});

builder.objectType(Log, {
  name: "Log",
  description: "A log is a message that is created during a job.",
  fields: (t) => ({
    id: t.exposeID("id"),
    jobId: t.exposeID("jobId", { nullable: true }),
    message: t.exposeString("message"),
    createdAt: t.exposeString("createdAt"),
  }),
});

builder.objectType(Project, {
  name: "Project",
  description: "A project is a collection of actions.",
  fields: (t) => ({
    id: t.exposeID("id"),
    path: t.exposeString("path"),
    name: t.exposeString("name"),
    createdAt: t.exposeString("createdAt"),
    logs: t.field({
      type: Log,
      nullable: true,
      resolve: (root) => root.logs,
    }),
    cursor: t.exposeString("cursor", { nullable: true }),
    picture: t.exposeString("picture"),
    speed: t.exposeFloat("speed", { nullable: true }),
    reliability: t.exposeFloat("reliability", { nullable: true }),
    buildsPerWeek: t.exposeInt("buildsPerWeek", { nullable: true }),
    recentRuns: t.field({
      type: [Run],
      nullable: true,
      resolve: (root) => root.recentRuns,
    }),
  }),
});

builder.objectType(Run, {
  name: "Run",
  description: "A Pipeline execution",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    title: t.exposeString("title"),
    message: t.exposeString("message", { nullable: true }),
    project: t.exposeString("project"),
    projectId: t.exposeString("projectId"),
    author: t.exposeString("author", { nullable: true }),
    commit: t.exposeString("commit", { nullable: true }),
    branch: t.exposeString("branch", { nullable: true }),
    duration: t.exposeInt("duration", { nullable: true }),
    date: t.exposeString("date"),
    jobs: t.field({
      type: [Job],
      resolve: (root) => root.jobs,
    }),
    cursor: t.exposeString("cursor", { nullable: true }),
    status: t.exposeString("status", { nullable: true }),
  }),
});

builder.objectType(Action, {
  name: "Action",
  description: "An action is a command that is run in a job.",
  fields: (t) => ({
    id: t.exposeID("id", { nullable: true }),
    name: t.exposeString("name"),
    commands: t.exposeString("commands"),
    enabled: t.exposeBoolean("enabled"),
    plugin: t.exposeString("plugin"),
    useWasm: t.exposeBoolean("useWasm"),
    logo: t.exposeString("logo", { nullable: true }),
  }),
});

export const ActionInput = builder.inputType("ActionInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    commands: t.string({ required: true }),
    enabled: t.boolean({ required: true }),
    plugin: t.string({ required: true }),
    useWasm: t.boolean({ required: true }),
    logo: t.string({ required: false }),
  }),
});

builder.queryType({
  fields: (t) => ({
    projects: t.field({
      type: [Project],
      args: {
        skip: t.arg.int(),
        limit: t.arg.int(),
        cursor: t.arg.string(),
        reverse: t.arg.boolean(),
      },
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
      args: {
        jobId: t.arg.id(),
        projectId: t.arg.id(),
      },
      resolve: getLogs,
    }),
    getRun: t.field({
      type: Run,
      nullable: true,
      args: {
        id: t.arg.id({ required: true }),
      },
      resolve: getRun,
    }),
    getRuns: t.field({
      type: [Run],
      nullable: true,
      args: {
        projectId: t.arg.id({ required: true }),
        skip: t.arg.int(),
        limit: t.arg.int(),
        cursor: t.arg.string(),
        reverse: t.arg.boolean(),
      },
      resolve: getRuns,
    }),
    actions: t.field({
      type: [Action],
      args: {
        projectId: t.arg.id({ required: true }),
      },
      nullable: true,
      resolve: getActions,
    }),
    countRuns: t.field({
      type: "Int",
      args: {
        projectId: t.arg.id({ required: true }),
      },
      resolve: countRuns,
    }),
    countProjects: t.field({
      type: "Int",
      resolve: countProjects,
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
      type: Run,
      args: {
        projectId: t.arg.id(),
        wait: t.arg.boolean({ required: false }),
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
    saveActions: t.field({
      type: [Action],
      args: {
        projectId: t.arg.id({ required: true }),
        actions: t.arg({
          type: [ActionInput],
          required: true,
        }),
      },
      resolve: saveActions,
    }),
  }),
});

export const schema = builder.toSchema();
