export interface Project {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  path: string;
  archived: boolean | null;
  tags: string[] | null;
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
  name: string;
  functions: string[];
}
