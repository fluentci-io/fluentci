export interface Project {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  path: string;
  archived: boolean | null;
  tags: string[] | null;
}

export interface WorkflowFilter {
  branches: string[];
  tags: string[];
  paths: string[];
}

export interface WorkflowEvents {
  push: WorkflowFilter | null;
  pullRequest: WorkflowFilter | null;
  manual: boolean;
  schedule: string[];
}

export interface Workflow {
  events?: WorkflowEvents;
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  env: string[];
  path: string | null;
  revision: string | null;
  stepCount: number;
  legacy: boolean;
}

export interface Action {
  name: string;
  commands: string;
  enabled: boolean;
  plugin: string;
  useWasm: boolean;
  env: string[] | null;
  workingDirectory: string | null;
}

export interface Job {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  duration: number | null;
}

export interface Run {
  id: string;
  workflowId?: string;
  workflowName?: string | null;
  projectId: string;
  title: string;
  status: string | null;
  date: string;
  duration: number;
  branch: string | null;
  commit: string | null;
  message: string | null;
  jobs: Job[];
}

export interface Log {
  id: string;
  jobId: string;
  message: string;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  kind: "PROJECT" | "RUN" | "LOG";
  projectId: string;
  runId: string | null;
  jobId: string | null;
  title: string;
  excerpt: string;
  createdAt: string;
}

export interface ModuleSuggestion {
  logo?: string | null;
  origin?: "LOCAL" | "REGISTRY";
  version?: string | null;
  description?: string | null;
  name: string;
  functions: string[];
}
