import { z } from "https://deno.land/x/zod@v3.22.2/mod.ts";

export const LabelSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const PipelineSchema = z.object({
  name: z.string(),
  labels: z.array(LabelSchema).optional().nullable(),
  weak: z.boolean().optional().nullable(),
});

export const LogEventSchema = z.object({
  v: z.string(),
  ts: z.string(),
  run_id: z.string().uuid(),
  type: z.string(),
  payload: z.object({
    op_id: z.string(),
    op_name: z.string(),
    pipeline: z.array(PipelineSchema).nullable(),
    internal: z.boolean(),
    inputs: z.array(z.string()).nullable(),
    started: z.string(),
    completed: z.string().optional().nullable(),
    cached: z.boolean(),
    error: z.string().optional(),
  }),
});

export const AgentSchema = z.object({
  agent_id: z.string(),
  hostname: z.string(),
  cpus: z.number(),
  arch: z.string(),
  totalmem: z.number(),
  platform: z.string(),
  release: z.string(),
  version: z.string(),
  pid: z.number(),
  daggerVersion: z.string(),
  startedAt: z.string(),
});

export const ActionSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string(),
  commands: z.string(),
  enabled: z.boolean(),
  plugin: z.string(),
  use_wasm: z.boolean(),
  logo: z.string().optional().nullable(),
  github_url: z.string().optional().nullable(),
});

export const LogSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  message: z.string(),
  createdAt: z.string(),
});

export const JobSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  name: z.string(),
  status: z.string(),
  created_at: z.string(),
  started_at: z.string().optional().nullable(),
  duration: z.number().optional().nullable(),
  logs: z.array(LogSchema).optional().nullable(),
});

export const RunSchema = z.object({
  id: z.string(),
  name: z.string(),
  project: z.string(),
  projectId: z.string(),
  title: z.string(),
  message: z.string().optional().nullable(),
  commit: z.string().optional().nullable(),
  author: z.string().optional().nullable(),
  branch: z.string().optional().nullable(),
  duration: z.number(),
  date: z.string(),
  jobs: z.array(JobSchema),
  cursor: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
});

export type Pipeline = z.infer<typeof PipelineSchema>;

export type Label = z.infer<typeof LabelSchema>;

export type LogEvent = z.infer<typeof LogEventSchema>;

export type Agent = z.infer<typeof AgentSchema>;

export type Action = z.infer<typeof ActionSchema>;

export type Log = z.infer<typeof LogSchema>;

export type Run = z.infer<typeof RunSchema>;

export type Job = z.infer<typeof JobSchema>;
