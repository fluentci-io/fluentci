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
    get: (project: string, id: string) => Promise<Run | null>;
    list: (
      project: string,
      options?: Pagination
    ) => Promise<{ runs: Run[]; cursor: string }>;
  };
};

export type Context = {
  socket?: WebSocket;
  kv: KV;
};
