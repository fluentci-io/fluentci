import { Log } from "./log.ts";

export class Job {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  duration?: number;
  logs?: Log[];

  constructor({ id, name, status, createdAt, logs, startedAt, duration }: Job) {
    this.id = id;
    this.name = name;
    this.status = status;
    this.createdAt = createdAt;
    this.startedAt = startedAt;
    this.logs = logs;
    this.duration = duration;
  }
}
