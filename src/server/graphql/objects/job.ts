import { Log } from "./log.ts";

export class Job {
  id: string;
  projectId: string;
  name: string;
  status: string;
  createdAt: string;
  logs?: Log;

  constructor({ id, projectId, name, status, createdAt, logs }: Job) {
    this.id = id;
    this.projectId = projectId;
    this.name = name;
    this.status = status;
    this.createdAt = createdAt;
    this.logs = logs;
  }
}
