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

export type Pipeline = z.infer<typeof PipelineSchema>;

export type Label = z.infer<typeof LabelSchema>;

export type LogEvent = z.infer<typeof LogEventSchema>;

export type Agent = z.infer<typeof AgentSchema>;
