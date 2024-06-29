import { Log } from "./log.ts";
import { Run } from "./run.ts";

export class Project {
  id: string;
  path: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  tags?: string[] | null;
  createdAt: string;
  logs?: Log;
  cursor?: string;
  picture: string;
  speed?: number;
  status?: string;
  reliability?: number;
  buildsPerWeek?: number;
  recentRuns?: Run[];

  constructor({
    id,
    path,
    name,
    displayName,
    description,
    tags,
    createdAt,
    logs,
    cursor,
    picture,
    speed,
    status,
    reliability,
    buildsPerWeek,
    recentRuns,
  }: Project) {
    this.id = id;
    this.path = path;
    this.name = name;
    this.displayName = displayName;
    this.description = description;
    this.tags = tags;
    this.createdAt = createdAt;
    this.logs = logs;
    this.cursor = cursor;
    this.picture = picture;
    this.speed = speed;
    this.status = status;
    this.reliability = reliability;
    this.buildsPerWeek = buildsPerWeek;
    this.recentRuns = recentRuns;
  }
}
