import { Pagination } from "../kv.ts";
import { Action } from "./objects/action.ts";
import { Project } from "./objects/project.ts";
import { Run } from "./objects/run.ts";

export type KV = {
  actions: {
    save: (project: string, data: Action[]) => Promise<void>;
    get: (project: string) => Promise<Action[]>;
  };
  projects: {
    save: (data: Project) => Promise<void>;
    get: (id: string) => Promise<Project | null>;
    at: (path: string) => Promise<Project | null>;
    list: (
      options?: Pagination
    ) => Promise<{ projects: Project[]; cursor: string }>;
  };
  runs: {
    save: (project: string, data: Run) => Promise<void>;
    get: (id: string) => Promise<Run | null>;
    list: (
      project: string,
      options?: Pagination
    ) => Promise<{ runs: Run[]; cursor: string }>;
    count: (project: string) => Promise<number>;
  };
};

export type Context = {
  sockets: WebSocket[];
  kv: KV;
};
