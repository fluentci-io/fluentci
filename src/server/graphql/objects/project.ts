import { Log } from "./log.ts";

export class Project {
  id: string;
  path: string;
  name: string;
  createdAt: string;
  logs?: Log;
  cursor?: string;
  picture: string;

  constructor({ id, path, name, createdAt, logs, cursor, picture }: Project) {
    this.id = id;
    this.path = path;
    this.name = name;
    this.createdAt = createdAt;
    this.logs = logs;
    this.cursor = cursor;
    this.picture = picture;
  }
}
